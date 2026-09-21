-- =====================================================================
-- Synthetic data. Fictional restaurants, invented equipment, invented
-- serials. Nothing here comes from any real operator's records.
--
-- Fixed UUIDs so evals and unit tests can reference rows directly.
-- Upserts, so re-running is safe and never touches work_order or event.
--
-- Three things in this data are load-bearing for the demo:
--
--   1. Harbor Street has TWO refrigeration units, on DIFFERENT refrigerants,
--      with DIFFERENT warranty status. That is what gives the walk-in /
--      reach-in question real dispatch delta -- it is not prompt theater,
--      it is two rows that disagree.
--   2. Delaware Ave has ONE refrigeration unit. Same sentence, no question
--      asked. The gate is reacting to data, not to phrasing.
--   3. No asset is trade 'electrical'. An electrical complaint therefore
--      exercises the unresolved-asset path on purpose.
-- =====================================================================

begin;

insert into location (id, name, address, timezone, opens_at, closes_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Harbor Street Tavern', '218 Harbor St', 'America/New_York', '11:00', '22:00'),
  ('aaaaaaaa-0000-4000-8000-000000000002',
   'Delaware Ave Counter', '1140 Delaware Ave', 'America/New_York', '07:00', '21:00')
on conflict (id) do update set
  name = excluded.name, address = excluded.address, timezone = excluded.timezone,
  opens_at = excluded.opens_at, closes_at = excluded.closes_at;

-- ---------------------------------------------------------------------
-- Harbor Street Tavern
-- ---------------------------------------------------------------------
insert into asset (id, location_id, trade, type, label, aliases, make, model, serial,
                   installed_on, warranty_expires_on, refrigerant_type) values

  -- The ambiguous pair. Same trade, different everything that matters.
  ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001',
   'refrigeration','walk_in_cooler','Walk-In Cooler — Kitchen Rear',
   '{walk-in,walkin,walk in,wic,big cooler,the big cooler,cooler in back,back cooler,big fridge,walk in box}',
   'Nor-Lake','KLB7746-C','NL-2023-44817','2023-03-14','2027-03-14','R-404A'),

  ('bbbbbbbb-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001',
   'refrigeration','reach_in_cooler','Reach-In Cooler — Cook Line',
   '{reach-in,reachin,reach in,line cooler,line fridge,small fridge,prep fridge,prep cooler,under counter}',
   'True','T-49-HC','TR-2019-90233','2019-08-01','2024-08-01','R-134a'),

  ('bbbbbbbb-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001',
   'cooking_equipment','fryer','Fryer — 3-Bay, Cook Line',
   '{fryer,fryers,deep fryer,fry station,fry vat,fryolator}',
   'Pitco','SG14-3','PT-2021-11902','2021-06-02','2023-06-02',null),

  ('bbbbbbbb-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000001',
   'plumbing','grease_trap','Grease Trap — Exterior',
   '{grease trap,grease interceptor,the trap,grease,interceptor}',
   'Schier','GB-250','SC-2018-33410','2018-04-19',null,null),

  ('bbbbbbbb-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-000000000001',
   'refrigeration','ice_machine','Ice Machine — Bar',
   '{ice machine,ice maker,ice,icemaker,bar ice}',
   'Hoshizaki','KM-520MAJ','HK-2022-77120','2022-09-30','2025-09-30','R-134a'),

  ('bbbbbbbb-0000-4000-8000-000000000006','aaaaaaaa-0000-4000-8000-000000000001',
   'networking','pos_terminal','POS Terminal — Front Counter',
   '{pos,register,till,card reader,terminal,point of sale,checkout}',
   'Toast','Flex','TS-2023-55018','2023-01-11','2026-01-11',null),

  ('bbbbbbbb-0000-4000-8000-000000000007','aaaaaaaa-0000-4000-8000-000000000001',
   'networking','network_switch','Network Switch — Office',
   '{switch,network,router,wifi,wi-fi,internet,modem}',
   'Ubiquiti','USW-24-PoE','UB-2023-10744','2023-01-11',null,null),

  ('bbbbbbbb-0000-4000-8000-000000000008','aaaaaaaa-0000-4000-8000-000000000001',
   'plumbing','three_comp_sink','Three-Compartment Sink — Dish Area',
   '{3 comp sink,three comp sink,three compartment sink,dish sink,wash sink,3 bay sink}',
   'Advance Tabco','94-3-54','AT-2018-20881','2018-04-19',null,null),

  ('bbbbbbbb-0000-4000-8000-000000000009','aaaaaaaa-0000-4000-8000-000000000001',
   'hvac','exhaust_hood','Exhaust Hood — Cook Line',
   '{hood,vent hood,exhaust hood,hood fan,exhaust fan,vent,makeup air}',
   'CaptiveAire','5424ND-2','CA-2018-60155','2018-04-19',null,null),

  ('bbbbbbbb-0000-4000-8000-000000000010','aaaaaaaa-0000-4000-8000-000000000001',
   'plumbing','water_heater','Water Heater — Utility Room',
   '{water heater,hot water heater,hot water tank,hot water,boiler}',
   'A.O. Smith','BTH-199','AO-2020-48293','2020-11-05','2026-11-05',null),

  ('bbbbbbbb-0000-4000-8000-000000000011','aaaaaaaa-0000-4000-8000-000000000001',
   'fire_safety','fire_suppression','Ansul Fire Suppression — Hood',
   '{ansul,fire suppression,suppression system,fire system,hood suppression}',
   'Ansul','R-102','AN-2018-70036','2018-04-19',null,null),

-- ---------------------------------------------------------------------
-- Delaware Ave Counter -- ONE refrigeration unit, deliberately
-- ---------------------------------------------------------------------
  ('bbbbbbbb-0000-4000-8000-000000000012','aaaaaaaa-0000-4000-8000-000000000002',
   'refrigeration','walk_in_cooler','Walk-In Cooler — Basement',
   '{walk-in,walkin,walk in,wic,big cooler,basement cooler,the cooler,downstairs cooler}',
   'Nor-Lake','KLB7746-C','NL-2024-51220','2024-02-20','2028-02-20','R-404A'),

  ('bbbbbbbb-0000-4000-8000-000000000013','aaaaaaaa-0000-4000-8000-000000000002',
   'cooking_equipment','griddle','Flat-Top Griddle — Line',
   '{griddle,flat top,flattop,grill,flat-top}',
   'Vulcan','HEG24E','VU-2024-31877','2024-02-20','2026-02-20',null),

  ('bbbbbbbb-0000-4000-8000-000000000014','aaaaaaaa-0000-4000-8000-000000000002',
   'plumbing','dishwasher','Dishwasher — Hobart AM-15',
   '{dishwasher,dish machine,hobart,dish washer,dishmachine}',
   'Hobart','AM15-2','HB-2021-64012','2021-07-14',null,null),

  ('bbbbbbbb-0000-4000-8000-000000000015','aaaaaaaa-0000-4000-8000-000000000002',
   'hvac','rooftop_hvac','Rooftop HVAC Unit',
   '{hvac,rooftop unit,rtu,ac,air conditioning,heat,furnace,climate}',
   'Carrier','48TC-06','CR-2020-19345','2020-05-08',null,'R-410A')

on conflict (id) do update set
  location_id = excluded.location_id, trade = excluded.trade, type = excluded.type,
  label = excluded.label, aliases = excluded.aliases, make = excluded.make,
  model = excluded.model, serial = excluded.serial, installed_on = excluded.installed_on,
  warranty_expires_on = excluded.warranty_expires_on,
  refrigerant_type = excluded.refrigerant_type;

commit;
