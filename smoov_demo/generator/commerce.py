"""Basket, loyalty, reconciliation and simulated attribution."""

from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta

from .model import age_on, cents_bps, chance, choose, clamp, group, rid, rng_for


class Commerce:
    def __init__(self, conf, stock, stores, context):
        self.conf = conf
        self.basket = conf["basket"]
        self.core = conf["core_categories"]
        self.stock = stock
        self.stores = stores
        self.context = context
        self.by_category = group(stock, "category")
        self.by_subcategory = group([p for p in stock if p["is_addon"]], "subcategory")
        self.channel_names = [r[0] for r in conf["channels"]]
        self.rules = conf["addon_rules"]

    def channel(self, rng, profile, store, ctx, date):
        weights = [r[1] for r in self.conf["channels"]]
        is_migrating = profile["trait_change"] == "migração digital" and date >= profile["transition_date"]
        digital = (0.62 + profile["digital_propensity"] * 2.7) * store["digital"]
        if is_migrating:
            digital *= 1 + 3.7 * self.conf["scenario_intensity"]
        weights[0] *= 0.79 if ctx["rain"] else 1
        for i in range(1, len(weights)):
            weights[i] *= digital * (1.38 if i == 2 and ctx["rain"] else 1)
        return choose(rng, list(range(len(weights))), weights)

    def drink(self, rng, p, store, ctx, date, offer):
        w = [a * b * c for a,b,c in zip(self.conf["category_mix"], p["category_weights"], store["mix"])]
        w[0] *= 1.28 if ctx["temperature_c"] >= 28 else 0.85 if ctx["temperature_c"] <= 19 else 1
        change = date >= p["transition_date"]
        cat_shift = change and p["trait_change"] == "troca de categoria"
        if cat_shift:
            old = self.core.index(p["preferred_category"])
            new = (old + 1) % len(self.core)
            w[old] *= 0.42
            w[new] *= 1 + 3.2 * self.conf["scenario_intensity"]
        category = choose(rng, self.core, w)
        shift = 0
        if change and p["trait_change"] in {"aceleração", "desaceleração"}:
            shift = (0.13 if p["trait_change"] == "aceleração" else -0.13) * self.conf["scenario_intensity"]
        if offer and offer[2] == "upselling de tamanho":
            shift += 0.19
        preferred_large = chance(rng, clamp(p["prefer_large"] + store["premium"] * 0.7 + shift))
        unavailable = set((ctx["stockout_families"] or "").split(" | "))
        available = [p for p in self.by_category[category] if p["name"] not in unavailable]
        if not available:
            available = [item for group_name in self.core for item in self.by_category[group_name] if item["name"] not in unavailable]
        weights = [
            (3.05 if (preferred_large and product["size"] == "480 ml") or (not preferred_large and product["size"] == "360 ml") else 0.48)
            * (1 + self.conf["behavior"]["favorite_repeat"] * 7.6 * (1-p["exploration_propensity"])
               if product["name"] == p["favorite_by_category"][category] else 1)
            for product in available
        ]
        return choose(rng, available, weights)

    def make_addons(self, rng, item, profile, store, allowed_age, offer):
        if item["category"] not in self.core:
            return []
        index = self.core.index(item["category"])
        if index not in self.rules["compatible_core_categories"]:
            return []
        p = self.basket["base_p_addon"][index] + profile["addon_propensity"] + store["addons"]
        if offer and offer[2] == "cross-selling de adicionais":
            p += 0.20
        if not chance(rng, clamp(p)):
            return []
        protein_group, supplement_group, superfood_group = (
            self.rules[key] for key in ("protein_group", "supplement_group", "superfood_group")
        )
        flavor = {
            "Smoov Matcha": "Creatina", "Smoov Supercoffee": "Whey Protein de Baunilha",
            "Smoov Detox": "Gengibre em Pó", "Smoov Tropical Fresh": "Semente de Chia"
        }.get(item["name"])
        groups = [protein_group, supplement_group, superfood_group]
        weights = [[0.15,0.21,0.64], [0.46,0.41,0.13], [0.46,0.16,0.38]][index].copy()
        if not allowed_age:
            weights[1] = 0
        limits = {
            groups[0]: self.rules["protein_category_max"] if index == 1 else self.rules["volume_ml"].get(item["size"].split()[0], 0),
            groups[1]: self.rules["supplements_max"], groups[2]: self.rules["superfoods_max"]
        }
        out = []
        for _ in range(1 + chance(rng, self.basket["second_dose_probability"])):
            possible = [w if limits[g] > 0 else 0 for g,w in zip(groups,weights)]
            if not sum(possible):
                break
            pool = choose(rng, groups, possible)
            limits[pool] -= 1
            out.append(choose(rng, self.by_subcategory[pool],
                              [4.7 if row["name"] == flavor else 1 for row in self.by_subcategory[pool]]))
        return out

    def order_basket(self, key, ordinal, customer, profile, slot, second_p):
        rng = rng_for(self.conf["seed"], f'basket:{key}:{ordinal}')
        store = self.stores[slot["store_id"]]
        d = slot["date"]
        ctx = self.context[slot["store_id"],d]
        channel = self.channel(rng, profile, store, ctx, d)
        offer = slot["offer"]
        first = self.drink(rng, profile, store, ctx, d, offer)
        products = []
        p_budget = (profile["habitual_budget_cents"] - 4100) / 11000
        trend = 0
        if d >= profile["transition_date"] and profile["trait_change"] in {"aceleração", "desaceleração"}:
            trend = (0.105 if profile["trait_change"] == "aceleração" else -0.10) * self.conf["scenario_intensity"]
        # Independent draws make the calibration reusable on the same pilot.
        draw_drink, draw_shared, draw_snack, draw_other, draw_snack_only = [rng.random() for _ in range(5)]
        snacks = self.by_category.get("Snacks", [])
        extras = self.by_category.get("Bebidas", [])
        if snacks and draw_snack_only < self.basket["snack_only_probability"]:
            products.append((rng.choice(snacks),1))
        else:
            products.append((first,1))
            if draw_drink < clamp(second_p + p_budget + 0.64*store["premium"] + trend + (0.07 if channel == 2 else 0)):
                second = first if chance(rng, .32) else self.drink(rng, profile, store, ctx, d, offer)
                products.append((second,1))
                if draw_shared < self.basket["large_group_probability"]:
                    products.append((self.drink(rng, profile, store, ctx, d, offer),1))
            if snacks and draw_snack < clamp(self.basket["snack_probability"] + p_budget/2 + store["premium"]/3 + trend):
                preferred = {"Protein Smoovs":"Bold Bar 60g","Healthy Shakes":"Cookie Proteico All Protein"}.get(first["category"])
                if preferred and chance(rng, self.basket["pair_affinity"]):
                    snack = next((row for row in snacks if row["name"] == preferred),None) or rng.choice(snacks)
                else:
                    snack = rng.choice(snacks)
                products.append((snack,1 + chance(rng,0.075 if channel == 2 else 0.025)))
        if extras and draw_other < self.basket["other_probability"]:
            products.append((rng.choice(extras),1))
        adult = age_on(customer["birth_date"], d) >= 18
        items = [(p, n, self.make_addons(rng, p, profile, store, adult, offer)) for p,n in products]
        price = sum(product["price_cents"]*n + sum(a["price_cents"] for a in addons) for product,n,addons in items)
        promo = chance(rng, clamp(0.12 * store["discount"] * (0.58 + profile["discount_sensitivity"])))
        sku_promo = chance(rng, 0.10 if ctx["event_types"] and "local_promo" in ctx["event_types"] else 0.025)
        item_disc = cents_bps(items[0][0]["price_cents"] * items[0][1], self.basket["item_promo_bps"]) if sku_promo else 0
        overall = cents_bps(price-item_disc, offer[1] if offer else self.basket["order_promo_bps"] if promo else 0)
        return rng, channel, items, price, item_disc, overall

    def calibrate(self, customers, truth, schedules):
        eligible = [(c, i, slot) for c in customers for i,slot in enumerate(schedules[c["customer_id"]])]
        sample = rng_for(self.conf["seed"], "calibration").sample(eligible, min(len(eligible), self.basket["pilot_size"]))
        low, high = self.basket["second_drink_bounds"]
        target = self.conf["target_ticket_cents"]
        trials = []
        for _ in range(9):
            guess = (low+high)/2
            observed = []
            for c,ordinal,slot in sample:
                key = c["customer_id"]
                _,_,_,price,item_disc,overall = self.order_basket(key,ordinal,c,truth[key],slot,guess)
                observed.append(price-item_disc-overall)
            # A pequena reserva aproxima o resgate médio que só se resolve com o ledger completo.
            estimate = sum(observed)/len(observed) - 9
            trials.append(dict(second_drink_probability=guess, estimated_ticket_cents=round(estimate,2), pilot_orders=len(sample)))
            if estimate > target:
                high = guess
            else:
                low = guess
        best = min(trials, key=lambda t: abs(t["estimated_ticket_cents"]-target))
        return best["second_drink_probability"], trials

    def execute(self, customers, truth, schedules, second_p, end, shard):
        tables = {key: [] for key in ("transactions","transaction_items","transaction_addons",
                                     "payments","transaction_discounts","loyalty_accounts","loyalty_events")}
        txs = tables["transactions"]
        for customer in customers:
            key = customer["customer_id"]
            account = key.replace("-CLI-", "-LOY-")
            ledger = tables["loyalty_events"]
            ledger_start = len(ledger)
            credits = deque()
            earned_total, redeemed_total, expired_total = 0, 0, 0

            def log_points(date, txid, kind, amount):
                balance = sum(c[1] for c in credits)
                ledger.append(dict(loyalty_event_id=rid("LEV",len(ledger)+1,shard),
                                   loyalty_account_id=account, transaction_id=txid,event_date=date,
                                   event_type=kind, points_delta=amount, balance_after=balance))

            def expire(date):
                nonlocal expired_total
                while credits and credits[0][0] <= date:
                    expiry,points = credits.popleft()
                    expired_total += points
                    log_points(expiry,None,"expiração",-points)

            for ordinal, slot in enumerate(schedules[key]):
                txid = rid("ORD",len(txs)+1,shard)
                d,store_id = slot["date"],slot["store_id"]
                ctx,store = self.context[store_id,d],self.stores[store_id]
                profile = truth[key]
                rng, channel, basket, gross, item_discount, order_promo = self.order_basket(key,ordinal,customer,profile,slot,second_p)
                expire(d)
                redeem_n = self.basket["loyalty_redeem_points"]
                rewards = sum(c[1] for c in credits) >= redeem_n and not slot["offer"] and chance(rng,0.47)
                benefit = min(gross-item_discount-order_promo,self.basket["loyalty_discount_cents"]) if rewards else 0
                if benefit:
                    left = redeem_n
                    while left:
                        expiry,points = credits.popleft()
                        take = min(points,left)
                        if points > take:
                            credits.appendleft((expiry,points-take))
                        left -= take
                    redeemed_total += redeem_n
                    log_points(d,txid,"resgate",-redeem_n)
                net = gross - item_discount - order_promo - benefit
                earned = net // self.basket["points_per_cents"]
                if earned:
                    credits.append((d+timedelta(days=self.basket["loyalty_expiry_days"]),earned))
                    earned_total += earned
                    log_points(d,txid,"crédito",earned)
                prev_eligible, prev_alloc, item_sum, addon_sum, cmv = 0,0,0,0,0
                rows = tables["transaction_items"]
                for i,(product,qty,addons) in enumerate(basket):
                    item_id = rid("ITM",len(rows)+1,shard)
                    gross_product = product["price_cents"]*qty
                    item_sum += gross_product
                    addons_total = sum(a["price_cents"] for a in addons)
                    addon_sum += addons_total
                    addon_cost = sum(a["cost_cents"] for a in addons)
                    cost = product["cost_cents"] * qty + addon_cost
                    cmv += cost
                    direct_disc = item_discount if i == 0 else 0
                    prev_eligible += gross_product + addons_total - direct_disc
                    allocated = prev_eligible*(order_promo+benefit)//(gross-item_discount)
                    discount = direct_disc + allocated - prev_alloc
                    prev_alloc = allocated
                    rows.append(dict(item_id=item_id,transaction_id=txid,sku=product["sku"],quantity=qty,
                                     unit_price_brl=product["price_cents"]/100,product_gross_brl=gross_product/100,
                                     addons_gross_brl=addons_total/100,discount_allocated_brl=discount/100,
                                     net_brl=(gross_product+addons_total-discount)/100,cmv_brl=cost/100))
                    for sku,n in Counter(a["sku"] for a in addons).items():
                        addon = next(a for a in addons if a["sku"]==sku)
                        addons_rows = tables["transaction_addons"]
                        addons_rows.append(dict(transaction_addon_id=rid("ADD",len(addons_rows)+1,shard),
                                                item_id=item_id,sku=sku,doses=n,unit_price_brl=addon["price_cents"]/100,
                                                gross_brl=n*addon["price_cents"]/100,cmv_brl=n*addon["cost_cents"]/100))
                    if direct_disc:
                        discounts = tables["transaction_discounts"]
                        discounts.append(dict(discount_id=rid("DIS",len(discounts)+1,shard),transaction_id=txid,item_id=item_id,
                                              discount_type="item", amount_brl=direct_disc/100,coupon_id=None))
                for kind,amount in (("campanha" if slot["offer"] else "combo ou cupom",order_promo),("fidelidade",benefit)):
                    if amount:
                        discounts = tables["transaction_discounts"]
                        discounts.append(dict(discount_id=rid("DIS",len(discounts)+1,shard),transaction_id=txid,item_id=None,
                                              discount_type=kind,amount_brl=amount/100,
                                              coupon_id=slot["offer"][0] if slot["offer"] else None))
                method = choose(rng,list(range(len(self.conf["payment_methods"]))),self.conf["payment_weights"][channel])
                method_name, payment_bps = self.conf["payment_methods"][method]
                channel_name, _, commission_bps, subsidy = self.conf["channels"][channel]
                fee, commission = cents_bps(net,payment_bps),cents_bps(net,commission_bps)
                cost_variable = fee+commission+subsidy
                center = 0.59*profile["preferred_hour"] + 0.41*store["peak"] + (1.15 if d.weekday()>=5 else 0)
                minute = round(rng.gauss(center*60,97))
                minute = max(ctx["opens_at_hour"]*60,min(ctx["closes_at_hour"]*60-1,minute))
                stamp = datetime(d.year,d.month,d.day,minute//60,minute%60,rng.randint(0,59))
                txs.append(dict(transaction_id=txid,organization_id=self.conf["organization_id"],customer_id=key,store_id=store_id,
                                sale_datetime=stamp,channel=channel_name,status="concluída",currency=self.conf["currency"],
                                product_subtotal_brl=item_sum/100,addons_subtotal_brl=addon_sum/100,gross_brl=gross/100,
                                discount_brl=(gross-net)/100,net_brl=net/100,cmv_brl=cmv/100,gross_profit_brl=(net-cmv)/100,
                                payment_fee_brl=fee/100,channel_commission_brl=commission/100,delivery_subsidy_brl=subsidy/100,
                                contribution_brl=(net-cmv-cost_variable)/100,amount_due_brl=net/100,campaign_id=slot["campaign_id"],
                                delivery_minutes=max(12,round(rng.gauss(33,7))) if channel==2 else None,is_synthetic=True))
                tables["payments"].append(dict(payment_id=rid("PAY",len(txs),shard),transaction_id=txid,payment_method=method_name,
                                               payment_status="capturado",amount_brl=net/100,fee_brl=fee/100))
            expire(end)
            balance = sum(c[1] for c in credits)
            tables["loyalty_accounts"].append(dict(loyalty_account_id=account,customer_id=key,joined_date=customer["registration_date"],
                                                   status="ativo",tier="ouro" if earned_total>=120 else "prata" if earned_total>=48 else "base",
                                                   points_earned=earned_total,points_redeemed=redeemed_total,
                                                   points_expired=expired_total,points_balance=balance,
                                                   available_rewards=balance//self.basket["loyalty_redeem_points"],
                                                   event_count=len(ledger)-ledger_start))
        return tables


def campaign_results(conf, campaigns, assignments, stages, transactions, shard):
    tx_by_customer = group(transactions,"customer_id")
    history = defaultdict(list)
    for assignment_id, kind, date in stages:
        history[assignment_id].append((kind,date,None))
    coupons,events,results = [],[],[]
    for a in assignments:
        choices = [t for t in tx_by_customer[a["customer_id"]]
                   if a["assigned_date"] < t["sale_datetime"].date() <= a["observation_end"]]
        conversion = choices[0] if choices else None
        attributed = next((t for t in choices if t["campaign_id"] == a["campaign_id"]),None)
        for kind,t in (("conversão_na_janela",conversion),("conversão_atribuída",attributed)):
            if t:
                history[a["assignment_id"]].append((kind,t["sale_datetime"].date(),t["transaction_id"]))
        results.append(dict(assignment_id=a["assignment_id"],campaign_id=a["campaign_id"],customer_id=a["customer_id"],
                            arm=a["arm"],conversion_id=conversion["transaction_id"] if conversion else None,
                            attributed_transaction_id=attributed["transaction_id"] if attributed else None,
                            window_revenue_brl=round(sum(t["net_brl"] for t in choices),2),
                            window_contribution_brl=round(sum(t["contribution_brl"] for t in choices),2),
                            attributed_revenue_brl=attributed["net_brl"] if attributed else 0,
                            attributed_contribution_brl=attributed["contribution_brl"] if attributed else 0,
                            cost_brl=a["cost_cents"]/100))
        if a["coupon_id"]:
            coupons.append(dict(coupon_id=a["coupon_id"],assignment_id=a["assignment_id"],
                                campaign_id=a["campaign_id"],expires_at=a["observation_end"],
                                redeemed_transaction_id=attributed["transaction_id"] if attributed else None,
                                status="resgatado" if attributed else "expirado"))
        for kind,date,txid in sorted(history[a["assignment_id"]],key=lambda e:e[1]):
            events.append(dict(campaign_event_id=rid("CEV",len(events)+1,shard),assignment_id=a["assignment_id"],
                               event_type=kind,event_date=date,transaction_id=txid,simulated=True))
    return coupons, events, results
