"""Persistent customer preferences, constrained schedules and CRM experiments."""

from collections import Counter
from datetime import date, timedelta
from math import exp

from .model import DAY, age_on, chance, choose, clamp, dates, month_date, quota, rid, rng_for

FIRST_NAMES = {
    "Feminino": "Alice Aline Amanda Ana Beatriz Bianca Bruna Camila Carolina Catarina Cecília Clara Daniela Eduarda Elisa Ester Fabiana Fernanda Gabriela Helena Heloísa Isabel Isadora Joana Júlia Laís Larissa Letícia Lívia Luana Luiza Manuela Marcela Mariana Marina Natália Olívia Patrícia Rafaela Renata Rita Sabrina Sofia Tainá Valentina Vitória Yasmin".split(),
    "Masculino": "Adriano Alexandre André Antônio Arthur Augusto Bernardo Bruno Caio Carlos César Daniel Davi Diogo Eduardo Elias Enzo Felipe Fernando Gabriel Gustavo Heitor Henrique Hugo Igor Joaquim João José Júlio Leonardo Lucas Luís Marcelo Márcio Matheus Miguel Murilo Nathan Nicolas Otávio Paulo Pedro Rafael Raul Renato Rodrigo Samuel Theo Tiago Vinícius".split(),
    "Não binário": "Alex Ariel Dominique Jaci Luan Niki Noa Ravi Toni".split(),
}
SURNAMES = "Aguiar Almeida Alves Amaral Andrade Araújo Azevedo Barbosa Barros Bastos Batista Borges Braga Camargo Campos Cardoso Carvalho Castilho Castro Coelho Correia Costa Cunha Dias Duarte Farias Fernandes Ferreira Freitas Garcia Gomes Gonçalves Guimarães Leal Lima Lopes Machado Martins Matos Melo Mendes Miranda Monteiro Moraes Moreira Moura Nascimento Neves Nogueira Novaes Oliveira Paiva Pereira Pires Prado Ramos Reis Ribeiro Rocha Rodrigues Sá Sales Santos Silveira Soares Souza Tavares Teixeira Torres Viana Vieira".split()


def allocate_frequencies(conf, rng, n_people, n_orders):
    bands = conf["frequency_bands"]
    people = quota(n_people, [b[2] for b in bands])
    specs = [(lo, hi, mean) for (lo, hi, _, mean), count in zip(bands, people) for _ in range(count)]
    freq = [round(clamp(rng.gauss(mean, max(0.3, (mean - lo) * 0.65)), lo, hi)) for lo, hi, mean in specs]
    delta = n_orders - sum(freq)
    direction = 1 if delta > 0 else -1
    while delta:
        possible = [i for i, (lo, hi, _) in enumerate(specs) if lo <= freq[i] + direction <= hi]
        rng.shuffle(possible)
        if not possible:
            raise ValueError("O total de compras é incompatível com as faixas de frequência.")
        for i in possible[:abs(delta)]:
            freq[i] += direction
            delta -= direction
    rng.shuffle(freq)
    return freq


def demographics(conf, rng, n, reference, shard):
    ages = [band for band, size in zip(conf["age_bands"], quota(n, [b[3] for b in conf["age_bands"]]))
            for _ in range(size)]
    rng.shuffle(ages)
    for i, (label, lo, hi, _) in enumerate(ages, 1):
        age = rng.randint(lo, hi)
        month, day = rng.randint(1, 12), rng.randint(1, 28)
        birth = date(reference.year - age - ((month, day) > (reference.month, reference.day)), month, day)
        gender = choose(rng, ["Feminino", "Masculino", "Não binário", None], [52, 44, 1, 3])
        first = rng.choice(FIRST_NAMES[gender or rng.choice(["Feminino", "Masculino"])])
        full = " ".join([first, *rng.sample(SURNAMES, 2)])
        customer_id = rid("CLI", i, shard)
        yield dict(customer_id=customer_id, external_customer_id=rid("EXT", i, shard),
                   organization_id=conf["organization_id"], full_name=full, birth_date=birth, age=age, age_group=label,
                   gender=gender, state=conf["state"], email=f'{customer_id.lower()}@example.com' if chance(rng, 0.91) else None,
                   phone=f'DEMO-NR-{shard}{i:07d}' if chance(rng, 0.9) else None, document_id=rid("DOC", i, shard),
                   communication_consent=age >= 18 and chance(rng, 0.74),
                   outbound_messaging_enabled=False, is_synthetic=True, is_demo=True)


def allocate_stores(conf, rng, stores, freq, personas):
    remaining = {key: row["order_quota"] for key, row in stores.items()}
    result = {}
    candidates = [(i, rng.random() ** (1 / (conf["behavior"]["multi_store_weight"] if p[0] == "multiloja" else 1)))
                  for i, p in enumerate(personas) if freq[i] >= 2]
    _, count_two, count_three = quota(len(freq), conf["multistore_weights"])
    choices = sorted(candidates, key=lambda pair: pair[1], reverse=True)
    many = {i for i, _ in [p for p in choices if freq[p[0]] >= 3][:count_three]}
    two = {i for i, _ in [p for p in choices if p[0] not in many][:count_two]}
    blocks = {}
    for i, size in enumerate(freq):
        if i in many:
            k = 4 if size >= 7 and chance(rng, 0.12) else 3
            parts = [1] * k
            for _ in range(size - k):
                parts[choose(rng, list(range(k)), [7, 2.4, 1.2, 0.6][:k])] += 1
            blocks[i] = sorted(parts, reverse=True)
        elif i in two:
            secondary = 1 if size == 2 else max(1, min(size // 2, round(size * rng.uniform(0.14, 0.42))))
            blocks[i] = [size - secondary, secondary]
        else:
            blocks[i] = [size]
    for i in sorted(range(len(freq)), key=lambda j: (freq[j], len(blocks[j])), reverse=True):
        visiting = []
        for n in blocks[i]:
            eligible = [k for k, cap in remaining.items() if cap >= n and k not in visiting]
            if not eligible:
                raise ValueError("As cotas de lojas não comportam a distribuição multiloja com a configuração atual.")
            if visiting:
                home = stores[visiting[0]]
                weights = [remaining[k] * (2.6 if stores[k]["city"] == home["city"] else 0.65) for k in eligible]
            else:
                weights = []
                for k in eligible:
                    one, recurring = conf["frequency_store_weights"].get(stores[k]["code"], [1, 1])
                    weights.append(remaining[k] * (one if freq[i] <= 2 else recurring))
            selected = choose(rng, eligible, weights)
            visiting.append(selected)
            remaining[selected] -= n
        result[i] = list(zip(visiting, blocks[i]))
    return result


def plan_customers(conf, stores, context, stock, start, end, reference, n_people, n_orders, shard=""):
    rng = rng_for(conf["seed"], "customers" + shard)
    freq = allocate_frequencies(conf, rng, n_people, n_orders)
    persona_weights = [p[1] for p in conf["personas"]]
    recurrent_weights = [p[1] * conf["personas_frequency_weight"].get(p[0], 1) for p in conf["personas"]]
    personas = [choose(rng, conf["personas"], recurrent_weights if f >= 5 else persona_weights) for f in freq]
    visits = allocate_stores(conf, rng, stores, freq, personas)
    customers = list(demographics(conf, rng, n_people, reference, shard))
    core = conf["core_categories"]
    families = {category: list(dict.fromkeys(p["name"] for p in stock if p["category"] == category))
                for category in core}
    available = {k: [d for d in dates(start, end) if context[k, d]["is_open"]] for k in stores}
    truth, schedules = {}, {}
    for i, customer in enumerate(customers):
        persona, _, affinity, premium, addons, explores, digital, peak, workweek = personas[i]
        count = freq[i]
        links = visits[i]
        home = stores[links[0][0]]
        client_id = customer["customer_id"]
        weights = [a * rng.lognormvariate(0, 0.28) for a in affinity]
        favorite_cat = choose(rng, core, weights)
        favorites = {cat: rng.choice(families[cat]) for cat in core}
        change = choose(rng, conf["behavior"]["changes"], conf["behavior"]["lifecycle_weights"])
        if count < 4:
            change = "estável"
        if change == "migração de loja" and len(links) < 2:
            change = "hiato"
        start_possible = max(start, min(stores[k]["opening_date"] for k, _ in links))
        full = (end - start_possible).days
        latest_start = max(0, full - min(full, max(8, count * 3)))
        birth_window = rng.betavariate(1.12 + (0.52 if home["code"] in {"PA","CA","SJ"} else 0), 1.25 + count / 2.2)
        register = start_possible + timedelta(days=int(birth_window * latest_start))
        if home["opening_date"] < start and chance(rng,conf["existing_base_share"].get(home["code"],.60)):
            register = max(home["opening_date"],start-timedelta(days=rng.randint(*conf["prior_registration_days"])))
        elif home["opening_date"] >= start and chance(rng,conf["opening_discovery_share"]):
            register = home["opening_date"] + timedelta(days=rng.randint(0,13))
        observation_start = max(register,start)
        customer.update(registration_date=register, city=home["city"], neighborhood=home["area"] if chance(rng, 0.88) else None,
                        loyalty_status="fidelizado", acquisition_store_id=home["store_id"],
                        acquisition_channel=choose(rng, ["Balcão", "Indicação", "Orgânico digital", "Evento local"], [58,23,14,5]))
        preferred_days = rng.sample(range(5 if workweek > 1.6 else 7), k=2)
        sensitivity = clamp(0.42 - premium + rng.uniform(-0.18,0.18))
        pref_time = max(8, min(19, round(0.64 * peak + 0.36 * home["peak"] + rng.gauss(0, 1.55))))
        strength = conf["scenario_intensity"]
        profile = dict(customer_id=client_id, persona=persona, planned_purchases=count, home_store_id=home["store_id"],
                       preexisting_registration=register<start,
                       planned_store_count=len(links), preferred_category=favorite_cat, favorite_product=favorites[favorite_cat],
                       favorite_by_category=favorites, category_weights=weights, habitual_gap_days=round(full / max(1,count), 2),
                       habitual_budget_cents=round(4100 + 4500 * premium + rng.gauss(0,380)),
                       premium_propensity=premium, addon_propensity=addons, exploration_propensity=explores,
                       prefer_large=clamp(conf["basket"]["base_p480"] + premium + rng.uniform(-0.15,0.15)),
                       discount_sensitivity=sensitivity, digital_propensity=digital, preferred_hour=pref_time,
                       preferred_weekdays=preferred_days, weekday_weight=workweek,
                       brand_loyalty=clamp(0.30 + count / 40 + rng.uniform(-0.2,0.2)),
                       store_loyalty=clamp(1 / len(links) + rng.uniform(-0.15,0.05)),
                       abandonment_propensity=clamp(0.48 - count / 75 + (0.24 if change == "desaceleração" else 0) + rng.uniform(-0.18,0.18)),
                       reactivation_propensity=clamp(0.21+sensitivity*0.36+rng.uniform(-0.12,0.12)),
                       trait_change=change, transition_date=start + timedelta(days=rng.randint(120,251)), is_synthetic=True)
        truth[client_id] = profile
        used, slots = set(), []
        for j, (store_id, needed) in enumerate(links):
            eligible = [d for d in available[store_id] if d >= register and d not in used]
            if len(eligible) < needed:
                raise ValueError(f"Histórico insuficiente para {client_id}, {store_id}.")
            factors = []
            for d in eligible:
                phase = (d - observation_start).days / max(1, (end - observation_start).days)
                w = context[store_id,d]["weight"]
                if d.weekday() in preferred_days:
                    w *= conf["behavior"]["preferred_weekday_boost"]
                if d.weekday() < 5:
                    w *= workweek
                if change == "aceleração":
                    w *= exp(strength * (phase - .5) * 2.9)
                elif change == "desaceleração":
                    w *= exp(strength * (.48 - phase) * 4.3)
                elif change == "hiato" and abs((d - profile["transition_date"]).days) < 54:
                    w *= max(0.016, 1 - strength * 0.95)
                elif change == "migração de loja":
                    w *= exp(strength * (phase - .5) * (3.9 if j else -3.0))
                if j and d.weekday() >= 5:
                    w *= 1.38
                if needed >= 9 and phase < 0.10:
                    w *= 1.18
                factors.append(w)
            # Lista acumulada evita recalcular os pesos a cada sorteio.
            sampled = set()
            while len(sampled) < needed:
                sampled.update(rng.choices(eligible, weights=factors, k=needed - len(sampled)))
            for d in sorted(sampled):
                used.add(d)
                slots.append(dict(date=d, store_id=store_id, offer=None, campaign_id=None, changed_date=False))
        schedules[client_id] = sorted(slots, key=lambda slot: slot["date"])
    return customers, truth, schedules


def campaign_eligible(kind, customer, past, send, primary):
    if not past or not customer["communication_consent"] or age_on(customer["birth_date"], send) < 18:
        return False
    recency = (send - past[-1]["date"]).days
    if kind in {"boas-vindas", "segunda compra"}:
        return len(past) == 1 and recency <= (35 if kind == "boas-vindas" else 85)
    if kind == "aniversário":
        return customer["birth_date"].month == send.month
    if kind == "reativação":
        return 60 <= recency <= 270
    if kind == "recuperação VIP":
        return len(past) >= 6 and recency >= 32
    if kind == "clientes em risco":
        return len(past) >= 3 and 40 <= recency <= 125
    if kind == "inauguração":
        return primary.endswith(("-SJ","-CA")) and recency <= 100
    if kind == "fidelização":
        return len(past) >= 3 and recency <= 75
    return recency <= 110


def simulate_campaigns(conf, customers, truth, schedules, context, start, end, shard=""):
    settings = conf["campaign"]
    rng = rng_for(conf["seed"], "campaigns" + shard)
    campaigns, assignments, events = [], [], []
    assigned_counts = Counter()
    for i, (month, day, kind_n, intensity) in enumerate(settings["calendar"], 1):
        kind = conf["campaign_types"][kind_n]
        sent = month_date(start, month, day)
        stop = min(end, sent + timedelta(days=settings["window_days"]))
        campaign_id = rid("CMP", i, shard)
        bps = 2950 if kind == "sazonal" else 2350 if kind == "inverno" else settings["discount_bps_default"]
        campaigns.append(dict(campaign_id=campaign_id, campaign_type=kind, objective=f'Estimular {kind}',
                              channel="simulador offline", eligibility_rule=kind, start_date=sent, end_date=stop,
                              attribution_window_days=settings["window_days"], discount_bps=bps, is_synthetic=True,
                              outbound_messaging_enabled=False))
        for customer in customers:
            key = customer["customer_id"]
            slots = schedules[key]
            if assigned_counts[key] >= settings["max_assignments_per_customer"]:
                continue
            past = [s for s in slots if s["date"] < sent]
            if not campaign_eligible(kind, customer, past, sent, truth[key]["home_store_id"]):
                continue
            if not chance(rng, settings["audience_fraction"]):
                continue
            arm = choose(rng, ["tratamento","controle","holdout"], settings["assignment_weights"])
            assignment_id = rid("ASG", len(assignments) + 1, shard)
            assigned_counts[key] += 1
            sent_sim = arm == "tratamento"
            delivered = sent_sim and chance(rng, settings["delivery_probability"])
            interaction = delivered and chance(rng, settings["interaction_probability"])
            coupon = rid("COUPON", len(assignments) + 1, shard) if delivered else None
            assignment = dict(assignment_id=assignment_id, campaign_id=campaign_id, customer_id=key,
                              arm=arm, assigned_date=sent, observation_end=stop, prior_purchases=len(past),
                              prior_recency_days=(sent-past[-1]["date"]).days, coupon_id=coupon,
                              send_simulated=sent_sim, delivery_simulated=delivered, interaction_simulated=interaction,
                              cost_cents=settings["send_cost_cents"] if sent_sim else 0,
                              eligible=True, eligible_at_risk_set=True)
            assignments.append(assignment)
            if sent_sim:
                events.append((assignment_id, "envio_simulado", sent))
            if delivered:
                events.append((assignment_id, "entrega_simulada", sent))
            if interaction:
                events.append((assignment_id, "interação_simulada", sent))
            occupied = {s["date"] for s in slots}
            existing = next((s for s in slots if sent < s["date"] <= stop), None)
            if delivered and existing is None and chance(rng, clamp(intensity * conf["scenario_intensity"] *
                                                                    (0.62+truth[key]["reactivation_propensity"]),0,1)):
                future = next((s for s in slots if s["date"] > stop and s["campaign_id"] is None), None)
                if future:
                    candidates = [d for d in dates(sent + DAY, stop) if d not in occupied and context[future["store_id"],d]["is_open"]]
                    if candidates:
                        future.update(date=rng.choice(candidates), changed_date=True)
                        slots.sort(key=lambda s: s["date"])
                        existing = future
            if delivered and existing is not None and existing["campaign_id"] is None and (interaction or existing["changed_date"]):
                existing.update(campaign_id=campaign_id, offer=(coupon,bps,kind))
    return campaigns, assignments, events
