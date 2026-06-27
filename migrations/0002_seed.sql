-- Seed: rooms + beds matching Sri Lakshmi Venkateshwara PG structure
-- Ground: 2 rooms | 1st-5th: 5 rooms each | 6th: 2 rooms = 29 rooms total
-- Adjust sharing_type per room once you know the real mix; defaults to 'double'.
-- You can edit any of this later from the Rooms screen in the app.

-- Ground Floor (2 rooms)
INSERT INTO rooms (floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
('Ground', 'G-1', 'double', 2, 12000, 7000, 4000),
('Ground', 'G-2', 'double', 2, 12000, 7000, 4000);

-- 1st Floor (5 rooms)
INSERT INTO rooms (floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
('1st', '1-1', 'double', 2, 12000, 7000, 4000),
('1st', '1-2', 'double', 2, 12000, 7000, 4000),
('1st', '1-3', 'double', 2, 12000, 7000, 4000),
('1st', '1-4', 'single', 1, 24000, 20000, 14000),
('1st', '1-5', 'double', 2, 12000, 7000, 4000);

-- 2nd Floor (5 rooms)
INSERT INTO rooms (floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
('2nd', '2-1', 'double', 2, 12000, 7000, 4000),
('2nd', '2-2', 'double', 2, 12000, 7000, 4000),
('2nd', '2-3', 'double', 2, 12000, 7000, 4000),
('2nd', '2-4', 'single', 1, 24000, 20000, 14000),
('2nd', '2-5', 'double', 2, 12000, 7000, 4000);

-- 3rd Floor (5 rooms)
INSERT INTO rooms (floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
('3rd', '3-1', 'double', 2, 12000, 7000, 4000),
('3rd', '3-2', 'double', 2, 12000, 7000, 4000),
('3rd', '3-3', 'double', 2, 12000, 7000, 4000),
('3rd', '3-4', 'single', 1, 24000, 20000, 14000),
('3rd', '3-5', 'double', 2, 12000, 7000, 4000);

-- 4th Floor (5 rooms)
INSERT INTO rooms (floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
('4th', '4-1', 'double', 2, 12000, 7000, 4000),
('4th', '4-2', 'double', 2, 12000, 7000, 4000),
('4th', '4-3', 'double', 2, 12000, 7000, 4000),
('4th', '4-4', 'single', 1, 24000, 20000, 14000),
('4th', '4-5', 'double', 2, 12000, 7000, 4000);

-- 5th Floor (5 rooms)
INSERT INTO rooms (floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
('5th', '5-1', 'double', 2, 12000, 7000, 4000),
('5th', '5-2', 'double', 2, 12000, 7000, 4000),
('5th', '5-3', 'double', 2, 12000, 7000, 4000),
('5th', '5-4', 'single', 1, 24000, 20000, 14000),
('5th', '5-5', 'double', 2, 12000, 7000, 4000);

-- 6th Floor (2 rooms)
INSERT INTO rooms (floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount) VALUES
('6th', '6-1', 'double', 2, 12000, 7000, 4000),
('6th', '6-2', 'double', 2, 12000, 7000, 4000);

-- Generate beds for every room (A for single, A+B for double)
INSERT INTO beds (room_id, bed_label)
SELECT id, 'A' FROM rooms;

INSERT INTO beds (room_id, bed_label)
SELECT id, 'B' FROM rooms WHERE capacity = 2;

-- NOTE: No staff account is created here on purpose.
-- After deploying, open your site's /setup.html page ONCE to create
-- your first owner login with a properly hashed password.
-- That page disables itself automatically after the first account exists.
