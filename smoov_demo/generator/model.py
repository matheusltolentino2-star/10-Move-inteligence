"""Configuration, deterministic primitives and relational dimensions."""

import hashlib
import json
import math
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from random import Random

DAY = timedelta(days=1)
ROOT = Path(__file__).resolve().parents[1]
BRANDS = ROOT / "config"
WEEKDAYS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def month_date(d, n=0, day=1):
    year, month = divmod(d.year * 12 + d.month - 1 + n, 12)
    return date(year, month + 1, min(day, monthrange(year, month + 1)[1]))


def age_on(birth, d):
    return d.year - birth.year - ((d.month, d.day) < (birth.month, birth.day))


def dates(start, end):
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def quota(total, weights):
    raw = [total * w / sum(weights) for w in weights]
    rounded = [int(n) for n in raw]
    for i in sorted(range(len(raw)), key=lambda i: (raw[i] - rounded[i], -i), reverse=True)[:total - sum(rounded)]:
        rounded[i] += 1
    return rounded


def cents_bps(cents, bps):
    return (cents * bps + 5000) // 10000


def chance(rng, probability):
    return rng.random() < probability


def clamp(value, low=0.015, high=0.96):
    return max(low, min(value, high))


def rng_for(seed, label):
    return Random(f"{seed}:{label}")


def choose(rng, values, weights):
    return rng.choices(values, weights=weights, k=1)[0]


def group(rows, field):
    out = defaultdict(list)
    for row in rows:
        out[row[field]].append(row)
    return out


def rid(kind, number, shard=""):
    return f"DEMO-{kind}-{shard}{number:07d}"


def load_config(path, profile, as_of=None):
    path = Path(path)
    conf = read_json(path)
    reference = date.fromisoformat(as_of or conf["as_of"])
    start, end = month_date(reference, -12), month_date(reference) - DAY
    if as_of is None and (start.isoformat(), end.isoformat()) != (conf["period_start"], conf["period_end"]):
        raise ValueError("O período configurado deve conter os 12 meses completos anteriores a as_of.")
    if not conf["organization_id"].startswith("DEMO-"):
        raise ValueError("O identificador da organização precisa começar com DEMO-.")
    catalog = read_json(path.parent / conf["catalog_file"])
    if len({r["sku"] for r in catalog}) != len(catalog) or any(r["price_cents"] <= 0 for r in catalog):
        raise ValueError("O catálogo precisa de SKUs únicos e preços positivos.")
    if len({r["code"] for r in conf["stores"]}) != len(conf["stores"]):
        raise ValueError("Códigos de loja duplicados.")
    conf.update(as_of=reference.isoformat(), period_start=start.isoformat(), period_end=end.isoformat())
    digest = hashlib.sha256(json.dumps([conf, catalog], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return conf, catalog, start, end, reference, conf["profiles"][profile], digest


def dimensions(conf, catalog, start, end, n_orders):
    rng = rng_for(conf["seed"], "dimensions")
    stores = {}
    for s, n in zip(conf["stores"], quota(n_orders, [s["quota"] for s in conf["stores"]])):
        key = f'{conf["organization_id"]}-{s["code"]}'
        stores[key] = dict(s, store_id=key, organization_id=conf["organization_id"],
                           store_name=f'{conf["brand"]} {s["area"]}', state=conf["state"],
                           opening_date=month_date(start, s["opened_month"], 3),
                           order_quota=n, is_demo=True)
    monthly = conf["weather"]["monthly_c"]
    rain = conf["weather"]["rain_probability"]
    stock = [dict(row, cost_cents=cents_bps(row["price_cents"], rng.randint(*conf["cost_ranges_bps"][row["category"]])))
             for row in catalog]
    events = []
    for i, (code, kind, month, day, duration, family) in enumerate(conf["operations"], 1):
        begin = month_date(start, month, day)
        events.append(dict(event_id=rid("OP", i), store_id=f'{conf["organization_id"]}-{code}', event_type=kind,
                           start_date=begin, end_date=min(end, begin + timedelta(days=duration - 1)),
                           product_family=family, is_synthetic=True))
    by_store = group(events, "store_id")
    context, calendar = {}, []
    for d in dates(start, end):
        m = d.month
        season = ["verão", "outono", "inverno", "primavera"][(m % 12) // 3]
        holiday = d.strftime("%m-%d") in conf["weather"]["configured_holidays"]
        vacation = m in conf["weather"]["vacation_months"]
        calendar.append(dict(date=d, month=d.strftime("%Y-%m"), iso_week=d.isocalendar().week, weekday=WEEKDAYS[d.weekday()],
                             is_weekend=d.weekday() >= 5, season=season, holiday_configured=holiday,
                             vacation_period=vacation, month_edge="início" if d.day <= 5 else "fim" if d.day >= 25 else "meio"))
        regional_noise = rng.gauss(0, conf["weather"]["day_c_noise"])
        storm = rng.random()
        for s in stores.values():
            k = s["store_id"]
            active = [e for e in by_store[k] if e["start_date"] <= d <= e["end_date"]]
            states = {e["event_type"] for e in active}
            stop = [e["product_family"] for e in active if e["event_type"] == "stockout"]
            is_open = d >= s["opening_date"] and "closed" not in states
            open_hour, close_hour = s["hours"]
            if d.weekday() >= 5:
                open_hour += 1
                close_hour -= 1
            if holiday or "reduced_hours" in states:
                open_hour += 1
                close_hour -= 2
            c = round(monthly[m - 1] + regional_noise + rng.gauss(0, 0.9) + (1.2 if s["code"] == "ST" else 0), 1)
            raining = storm + rng.uniform(-0.17, 0.17) < rain[m - 1]
            local_event = choose(rng, [None, "corrida de rua", "feira de bairro"], [98, 1, 1])
            t = (d - start).days / max(1, (end - start).days)
            op_age = (d - s["opening_date"]).days
            weight = math.exp(s["trend"] * (2 * t - 1))
            weight *= s["workweek"] if d.weekday() < 5 else 1
            weight *= (0.78 if vacation and s["workweek"] >= 1.8 else 1) * (0.78 if raining else 1)
            weight *= 0.88 if holiday else (1.13 if d.day <= 5 else 1)
            if s["code"] == "ST":
                weight *= conf["weather"]["summer_coast_weight"] if season == "verão" else conf["weather"]["winter_coast_weight"] if season == "inverno" else 1
            if s["opened_month"] >= 0:
                weight *= (1.9 if 0 <= op_age < 16 else (0.67 if op_age < 70 else 1 + op_age / 420))
            if "reduced_hours" in states:
                weight *= 0.48
            if states.intersection({"local_promo", "reopening"}) or local_event:
                weight *= 1.18
            context[k, d] = dict(store_id=k, date=d, temperature_c=c, rain=raining,
                                 sunny=not raining and c >= 23, season=season, local_event=local_event,
                                 is_open=is_open, opens_at_hour=open_hour if is_open else None,
                                 closes_at_hour=close_hour if is_open else None, stockout_families=" | ".join(stop) or None,
                                 event_types=" | ".join(sorted(states)) or None, is_synthetic=True, weight=weight)
    return stores, stock, events, calendar, context
