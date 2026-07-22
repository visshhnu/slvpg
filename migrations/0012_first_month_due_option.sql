-- migrations/0012_first_month_due_option.sql
-- Per-resident choice for when their FIRST (join-month, pro-rated) rent is
-- due -- most residents are fine on the regular cycle, but someone joining
-- after the 15th-20th often prefers paying on their own join-date anniversary
-- instead. NULL/'cycle' = regular cycle (5th, or month-end if that's already
-- passed -- see functions/_ledger.js computeMonthRentDetails). 'join_date' =
-- due on the day they joined. Only affects the join month; every month after
-- reverts to the normal 5th-of-month cycle regardless of this value.
ALTER TABLE residents ADD COLUMN first_month_due_option TEXT;
