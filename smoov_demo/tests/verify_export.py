"""Read the persisted GOLD tables and independently reconcile every exported order."""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook


def rows(sheet):
    values=sheet.values
    header=next(values)
    for value in values:
        yield dict(zip(header,value))


def cents(row,key):
    return round(row[key]*100)


def verify(profile):
    book=load_workbook(profile/"datasets/smoov_demo_database.xlsx",read_only=True,data_only=False)
    try:
        orders={}
        for r in rows(book["transactions"]):
            key=r["transaction_id"]
            assert key not in orders
            gross,discount,net,cmv=[cents(r,k) for k in ("gross_brl","discount_brl","net_brl","cmv_brl")]
            assert gross-discount==net==cents(r,"amount_due_brl")
            orders[key]=(gross,discount,net,cmv,cents(r,"addons_subtotal_brl"))
        items={}
        line_sums=defaultdict(Counter)
        for r in rows(book["transaction_items"]):
            key,order=r["item_id"],r["transaction_id"]
            assert key not in items and order in orders
            addons=cents(r,"addons_gross_brl")
            gross,discount,net,cmv=cents(r,"product_gross_brl")+addons,cents(r,"discount_allocated_brl"),cents(r,"net_brl"),cents(r,"cmv_brl")
            assert cents(r,"product_gross_brl")==r["quantity"]*cents(r,"unit_price_brl") and gross-discount==net
            items[key]=addons
            line_sums[order].update(dict(zip(range(5),(gross,discount,net,cmv,addons))))
        received=Counter()
        for r in rows(book["payments"]):
            received[r["transaction_id"]]+=cents(r,"amount_brl")
        allowances=Counter()
        for r in rows(book["transaction_discounts"]):
            allowances[r["transaction_id"]]+=cents(r,"amount_brl")
        item_addons=Counter()
        for r in rows(book["transaction_addons"]):
            item_addons[r["item_id"]]+=cents(r,"gross_brl")
            assert cents(r,"unit_price_brl")*r["doses"]==cents(r,"gross_brl")
        assert set(received)==set(orders)==set(line_sums)
        assert set(allowances)<=set(orders) and set(item_addons)<=set(items)
        for key,(gross,discount,net,cmv,addons) in orders.items():
            assert (gross,discount,net,cmv,addons)==tuple(line_sums[key][i] for i in range(5))
            assert discount==allowances[key] and net==received[key]
        assert all(item_addons[key]==amount for key,amount in items.items())
    finally:
        book.close()
    net_cents=sum(v[2] for v in orders.values())
    report=json.loads((profile/"reports/validation_report.json").read_text(encoding="utf-8"))
    assert net_cents==round(report["business"]["net_brl"]*100)
    assert len(orders)==report["business"]["orders"]
    result=dict(status="PASS",orders=len(orders),items=len(items),net_brl=net_cents/100,
                scope="Cada linha salva de pedidos, itens, pagamentos, adicionais e descontos.")
    (profile/"reports/export_test.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return result


if __name__=="__main__":
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument("profile",type=Path,help="Diretório do perfil exportado")
    print(json.dumps(verify(cli.parse_args().profile),ensure_ascii=False))
