"""Regression tests for hard constraints and deterministic replay."""

import tempfile
import unittest
from collections import Counter
from datetime import date
from pathlib import Path

from generator.__main__ import simulate
from generator.analytics import rfm
from generator.delivery import verify_workbook, write_workbook
from generator.fixtures import fixture_sets
from generator.journey import allocate_frequencies
from generator.model import BRANDS, age_on, load_config, quota, rng_for
from generator.scenarios import classifier_scores


class GeneratorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conf, cls.catalog, cls.start, cls.end, cls.ref, cls.counts, _ = load_config(BRANDS/"smoov_config.json","micro")
        cls.data = simulate(cls.conf,cls.catalog,cls.start,cls.end,cls.ref,"micro",cls.counts)

    def test_rounding_and_calendar(self):
        self.assertEqual(quota(100,[75,18,7]),[75,18,7])
        self.assertEqual(sum(quota(382644,[3,5,7,9])),382644)
        self.assertEqual(age_on(date(2008,12,1),self.ref),17)
        self.assertEqual((self.start,self.end),(date(2025,11,1),date(2026,10,31)))

    def test_full_scale_frequency_allocation(self):
        rows=allocate_frequencies(self.conf,rng_for(42,"tests"),10000,50000)
        self.assertEqual(sum(rows),50000)
        self.assertEqual([sum(lo<=n<=hi for n in rows) for lo,hi,*_ in self.conf["frequency_bands"]],
                         [3000,2000,2000,1800,900,280,20])

    def test_demo_catalog(self):
        self.assertEqual(sum(not row["is_addon"] for row in self.catalog),27)
        self.assertEqual(sum(row["is_addon"] for row in self.catalog),15)
        self.assertEqual(len({p["sku"] for p in self.catalog}),42)

    def test_generation_invariants(self):
        main,extra,truth,labels,manifest,_,summary,checks,_,_=self.data
        self.assertTrue(all(r["status"]=="PASS" for r in checks),checks)
        self.assertEqual(summary["orders"],500)
        self.assertEqual(len(truth),100)
        self.assertEqual(len(manifest),40)
        self.assertTrue(any(c["registration_date"]<self.start for c in main["customers"]))
        self.assertTrue(any(c["is_censored"] for c in labels))
        self.assertEqual(Counter(r["arm"] for r in extra["experiment_assignments"]).keys(),
                         {"tratamento","controle","holdout"})

    def test_semantic_replay(self):
        copy=simulate(self.conf,self.catalog,self.start,self.end,self.ref,"micro",self.counts)
        self.assertEqual(copy[:8],self.data[:8])
        self.assertEqual(copy[9],self.data[9])

    def test_workbook_round_trip(self):
        raw,_,_,_,_=fixture_sets(self.conf["organization_id"],self.start,self.end)
        with tempfile.TemporaryDirectory(dir=BRANDS.parent.parent.parent) as directory:
            path=Path(directory)/"sample.xlsx"
            write_workbook(path,raw)
            self.assertEqual(verify_workbook(path,raw),{"clientes_raw":11,"itens_raw":11,"arquivo_incompleto":1})

    def test_scoring(self):
        self.assertEqual(rfm(4,12,(8,19,3,8)),(3,3,"Campeões"))
        self.assertEqual(rfm(20,4,(8,19,3,8)),(1,2,"Em risco"))
        m=classifier_scores({"A","B"},["A","A","C","B"],k=2)
        self.assertEqual((m["tp"],m["fp"],m["fn"],m["precision"],m["recall"],m["f1"]),(1,1,1,.5,.5,.5))


if __name__=="__main__":
    unittest.main()
