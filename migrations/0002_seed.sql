-- Seed: first PG (Sri Lakshmi Venkateshwara) with its 29-room structure.
-- Edit name/address/landlord details anytime from the app's PG settings screen.

INSERT INTO pgs (name, address, contact_phone, landlord_name, landlord_phone) VALUES
('Sri Lakshmi Venkateshwara Luxury Co-Living PG',
 'Ashraya Layout, 1st Cross, 2nd Stage, Graphite India Road, Garudacharapalya, Opp. Shakthi Precision Components, Mahadevapura Post, Bangalore - 560048',
 '9014761228', NULL, NULL);

-- Ground Floor (2 rooms)
INSERT INTO rooms (pg_id, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
(1, 'Ground', 'G-1', 'double', 2, 12000, 7000, 4000),
(1, 'Ground', 'G-2', 'double', 2, 12000, 7000, 4000);

-- 1st Floor (5 rooms)
INSERT INTO rooms (pg_id, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
(1, '1st', '1-1', 'double', 2, 12000, 7000, 4000),
(1, '1st', '1-2', 'double', 2, 12000, 7000, 4000),
(1, '1st', '1-3', 'double', 2, 12000, 7000, 4000),
(1, '1st', '1-4', 'single', 1, 24000, 20000, 14000),
(1, '1st', '1-5', 'double', 2, 12000, 7000, 4000);

-- 2nd Floor (5 rooms)
INSERT INTO rooms (pg_id, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
(1, '2nd', '2-1', 'double', 2, 12000, 7000, 4000),
(1, '2nd', '2-2', 'double', 2, 12000, 7000, 4000),
(1, '2nd', '2-3', 'double', 2, 12000, 7000, 4000),
(1, '2nd', '2-4', 'single', 1, 24000, 20000, 14000),
(1, '2nd', '2-5', 'double', 2, 12000, 7000, 4000);

-- 3rd Floor (5 rooms)
INSERT INTO rooms (pg_id, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
(1, '3rd', '3-1', 'double', 2, 12000, 7000, 4000),
(1, '3rd', '3-2', 'double', 2, 12000, 7000, 4000),
(1, '3rd', '3-3', 'double', 2, 12000, 7000, 4000),
(1, '3rd', '3-4', 'single', 1, 24000, 20000, 14000),
(1, '3rd', '3-5', 'double', 2, 12000, 7000, 4000);

-- 4th Floor (5 rooms)
INSERT INTO rooms (pg_id, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
(1, '4th', '4-1', 'double', 2, 12000, 7000, 4000),
(1, '4th', '4-2', 'double', 2, 12000, 7000, 4000),
(1, '4th', '4-3', 'double', 2, 12000, 7000, 4000),
(1, '4th', '4-4', 'single', 1, 24000, 20000, 14000),
(1, '4th', '4-5', 'double', 2, 12000, 7000, 4000);

-- 5th Floor (5 rooms)
INSERT INTO rooms (pg_id, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
(1, '5th', '5-1', 'double', 2, 12000, 7000, 4000),
(1, '5th', '5-2', 'double', 2, 12000, 7000, 4000),
(1, '5th', '5-3', 'double', 2, 12000, 7000, 4000),
(1, '5th', '5-4', 'single', 1, 24000, 20000, 14000),
(1, '5th', '5-5', 'double', 2, 12000, 7000, 4000);

-- 6th Floor (2 rooms)
INSERT INTO rooms (pg_id, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
(1, '6th', '6-1', 'double', 2, 12000, 7000, 4000),
(1, '6th', '6-2', 'double', 2, 12000, 7000, 4000);

-- Generate beds for every room (A for single, A+B for double)
INSERT INTO beds (room_id, bed_label)
SELECT id, 'A' FROM rooms;

INSERT INTO beds (room_id, bed_label)
SELECT id, 'B' FROM rooms WHERE capacity = 2;

-- Standard facility checklist for every room, per the SVPG spec doc
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Bed', capacity FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Mattress', capacity FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Pillow', capacity FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Cupboard', capacity FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Chair', capacity FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Study Table', capacity FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Fan', 1 FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Geyser', 1 FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Light', 2 FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Bucket', capacity FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Mug', capacity FROM rooms;
INSERT INTO room_facilities (room_id, item_name, quantity)
SELECT id, 'Attached Bathroom', 1 FROM rooms;

-- NOTE: No staff account is created here on purpose.
-- After deploying, open your site's setup screen ONCE to create
-- your first admin login with a properly hashed password.
-- That screen disables itself automatically after the first account exists.
