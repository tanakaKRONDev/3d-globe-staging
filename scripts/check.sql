-- Single query for db:check: outputs total, min_order, max_order, duplicate_count, missing_required
SELECT
  (SELECT COUNT(*) FROM stops) AS total,
  (SELECT MIN(stop_order) FROM stops) AS min_order,
  (SELECT MAX(stop_order) FROM stops) AS max_order,
  (SELECT COUNT(*) FROM (SELECT stop_order FROM stops GROUP BY stop_order HAVING COUNT(*) > 1)) AS duplicate_count,
  (SELECT COUNT(*) FROM stops
   WHERE id IS NULL OR city IS NULL OR venue IS NULL OR address IS NULL
      OR lat IS NULL OR lng IS NULL OR stop_order IS NULL) AS missing_required;
