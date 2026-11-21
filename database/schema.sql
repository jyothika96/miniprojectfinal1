-- =====================================================================
-- Community Disease Surveillance and Early-Warning System (CDSEWS)
-- MySQL 8.0 Database Schema & Realistic Synthetic Sample Data
--
-- DISCLAIMER:
-- Educational prototype for public health monitoring and academic training.
-- Never uses real patient-identifiable data.
-- Alerts indicate statistical anomalies requiring human review, not diagnostic proof.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS disease_surveillance
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE disease_surveillance;

-- Drop child tables first for clean recreation if re-run
DROP TABLE IF EXISTS alert_reviews;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS case_reports;
DROP TABLE IF EXISTS threshold_settings;
DROP TABLE IF EXISTS facilities;
DROP TABLE IF EXISTS regions;
DROP TABLE IF EXISTS disease_categories;
DROP TABLE IF EXISTS users;

-- ---------------------------------------------------------------------
-- 1. USERS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role ENUM('admin', 'epidemiologist', 'health_officer', 'analyst', 'public') NOT NULL DEFAULT 'health_officer',
  phone VARCHAR(30) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. REGIONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE regions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  population INT NOT NULL,
  climate_zone VARCHAR(60) DEFAULT 'Temperate',
  risk_level ENUM('Low', 'Moderate', 'High', 'Critical') DEFAULT 'Low',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_regions_risk (risk_level)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. FACILITIES TABLE (Healthcare centers, district hospitals, clinics)
-- ---------------------------------------------------------------------
CREATE TABLE facilities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  region_id INT NOT NULL,
  facility_type ENUM('District Hospital', 'Community Health Center', 'Rural Clinic', 'Mobile Unit', 'Private Medical Center') NOT NULL,
  bed_capacity INT DEFAULT 50,
  contact_person VARCHAR(100),
  contact_email VARCHAR(120),
  phone VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE,
  INDEX idx_facilities_region (region_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. DISEASE CATEGORIES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE disease_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  icd_code VARCHAR(30) NOT NULL,
  transmission_type ENUM('Airborne', 'Vector-borne', 'Water-borne', 'Contact / Food-borne', 'Zoonotic') NOT NULL,
  incubation_period_days INT DEFAULT 5,
  default_alert_threshold INT NOT NULL DEFAULT 15,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_disease_transmission (transmission_type)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. THRESHOLD SETTINGS TABLE (Configurable alerts per disease)
-- ---------------------------------------------------------------------
CREATE TABLE threshold_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  disease_id INT NOT NULL UNIQUE,
  weekly_threshold INT NOT NULL DEFAULT 20,
  spike_percentage INT NOT NULL DEFAULT 40,
  is_active BOOLEAN DEFAULT TRUE,
  notification_email VARCHAR(120),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (disease_id) REFERENCES disease_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. CASE REPORTS TABLE (Aggregated community disease surveillance logs)
-- ---------------------------------------------------------------------
CREATE TABLE case_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  disease_id INT NOT NULL,
  region_id INT NOT NULL,
  facility_id INT NOT NULL,
  report_date DATE NOT NULL,
  case_count INT NOT NULL CHECK (case_count >= 1),
  severity_level ENUM('Mild', 'Moderate', 'Severe') NOT NULL DEFAULT 'Moderate',
  hospitalized_count INT DEFAULT 0,
  suspected_source VARCHAR(180) DEFAULT 'Community Transmission',
  notes TEXT,
  reported_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (disease_id) REFERENCES disease_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT,
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_reports_date (report_date),
  INDEX idx_case_reports_disease (disease_id),
  INDEX idx_case_reports_region (region_id),
  INDEX idx_case_reports_facility (facility_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. ALERTS TABLE (Automated and manual early-warning detections)
-- ---------------------------------------------------------------------
CREATE TABLE alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  disease_id INT NOT NULL,
  region_id INT NOT NULL,
  facility_id INT NULL,
  trigger_type ENUM('Threshold Breach', 'Rapid Spike', 'Cluster Detected', 'Manual Signal') NOT NULL DEFAULT 'Threshold Breach',
  severity ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL DEFAULT 'Medium',
  case_count_snapshot INT NOT NULL,
  threshold_snapshot INT NOT NULL,
  status ENUM('New', 'Investigating', 'Resolved', 'False Alarm') NOT NULL DEFAULT 'New',
  message VARCHAR(255) NOT NULL,
  alert_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (disease_id) REFERENCES disease_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL,
  INDEX idx_alerts_status (status),
  INDEX idx_alerts_severity (severity),
  INDEX idx_alerts_date (alert_date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. ALERT REVIEWS & INVESTIGATION TRACKING TABLE
-- ---------------------------------------------------------------------
CREATE TABLE alert_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  reviewer_id INT NULL,
  previous_status ENUM('New', 'Investigating', 'Resolved', 'False Alarm') NOT NULL,
  new_status ENUM('New', 'Investigating', 'Resolved', 'False Alarm') NOT NULL,
  notes TEXT NOT NULL,
  action_taken VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_alert_reviews_alert (alert_id)
) ENGINE=InnoDB;

-- =====================================================================
-- SYNTHETIC SAMPLE SEED DATA
-- Relative dates (CURDATE() - INTERVAL) guarantee charts and metrics
-- are immediately rich, current, and active when tested.
-- =====================================================================

-- 1. Insert Users
INSERT INTO users (username, email, password_hash, full_name, role, phone) VALUES
('dr_sharma', 'dr.sharma@healthsurveillance.org', '$2b$10$MEYLcvMxGPEbS8HLagWsb.J9xBN.iktGeQWYBQ.r9kaVNmJ.Mqm6S', 'Dr. Radhika Sharma', 'epidemiologist', '+91-98765-43210'),
('officer_raj', 'rajesh.kumar@healthsurveillance.org', '$2b$10$qpDen0.C1e2o6YUS5DbxiuRFHWKPku40sATcQne5SU7iiiOyMUKBS', 'Rajesh Kumar', 'health_officer', '+91-98123-55667'),
('analyst_priya', 'priya.patel@healthsurveillance.org', '$2b$10$qwBomRF8X5Ct6gKibLGbO.aLYaAfEdizuDcJFB.DYWsgap1cBe8HC', 'Priya Patel', 'analyst', '+91-98901-22334'),
('admin_surv', 'admin@healthsurveillance.org', '$2b$10$negEI3RiM3vlCCeKCES5BOybguFOPuip0a6nY7DQlWoXVVsAx.Sk6', 'System Administrator', 'admin', '+91-98444-11223');

-- 2. Insert Regions
INSERT INTO regions (name, code, population, climate_zone, risk_level) VALUES
('North Metro District', 'REG-N01', 1250000, 'Subtropical Dense Urban', 'High'),
('Riverside Basin', 'REG-R02', 680000, 'Riverine Monsoon Lowland', 'Moderate'),
('Highland Valley', 'REG-H03', 340000, 'Alpine Mountainous', 'Low'),
('Coastal Delta Zone', 'REG-C04', 890000, 'Humid Coastal Tropical', 'Critical'),
('Central Urban Corridor', 'REG-U05', 1420000, 'Commercial Metropolitan', 'Moderate'),
('Southern Agricultural Belt', 'REG-S06', 510000, 'Semiarid Rural Farming', 'Low');

-- 3. Insert Facilities
INSERT INTO facilities (name, region_id, facility_type, bed_capacity, contact_person, contact_email, phone) VALUES
('City Central Memorial Hospital', 1, 'District Hospital', 450, 'Dr. Vinay Saxena', 'central.hospital@healthsurveillance.org', '011-2334455'),
('Northside Community Clinic', 1, 'Community Health Center', 40, 'Nurse In-charge Anjali', 'northside.clinic@healthsurveillance.org', '011-2334456'),
('Riverside Primary Health Center', 2, 'Community Health Center', 35, 'Dr. Meera Sen', 'riverside.phc@healthsurveillance.org', '033-4455667'),
('Delta Port General Hospital', 4, 'District Hospital', 320, 'Dr. Arindam Bose', 'deltaport.gen@healthsurveillance.org', '044-6677889'),
('Fisherman Bay Health Post', 4, 'Rural Clinic', 15, 'Officer Tarun Das', 'fishbay.post@healthsurveillance.org', '044-6677890'),
('Highland District Infirmary', 3, 'District Hospital', 110, 'Dr. Sunita Negi', 'highland.infirmary@healthsurveillance.org', '0135-224455'),
('Central Metro Urgent Care', 5, 'Private Medical Center', 65, 'Dr. K. Venkatesh', 'metro.urgent@healthsurveillance.org', '080-2211990'),
('South Greens Field Clinic', 6, 'Rural Clinic', 20, 'Dr. Harish Gowda', 'southgreens.clinic@healthsurveillance.org', '0821-443322'),
('Mobile Medical Surveillance Unit Alpha', 4, 'Mobile Unit', 0, 'Surv. Lead Preeti', 'mobile.alpha@healthsurveillance.org', '044-9988776'),
('Riverside East Urgent Outpost', 2, 'Rural Clinic', 25, 'Dr. A. K. Biswas', 'riverside.east@healthsurveillance.org', '033-9988112');

-- 4. Insert Disease Categories
INSERT INTO disease_categories (name, icd_code, transmission_type, incubation_period_days, default_alert_threshold, description) VALUES
('Dengue Fever', 'A90', 'Vector-borne', 7, 18, 'Mosquito-borne viral infection causing high fever, joint pain, and potential hemorrhagic complications. Common in post-monsoon urban and coastal puddles.'),
('Influenza-Like Illness (ILI)', 'J11', 'Airborne', 3, 28, 'Acute respiratory infection with sudden onset of fever, cough, and systemic symptoms with high communal droplet transmission.'),
('Acute Watery Diarrhea / Cholera Risk', 'A00', 'Water-borne', 2, 12, 'Rapidly dehydrating enteric infection often linked to compromised municipal pipelines or contaminated groundwater.'),
('Measles', 'B05', 'Airborne', 12, 5, 'Highly contagious viral infection preventable by vaccination. Even small clusters trigger immediate immunization ring response.'),
('Typhoid Fever', 'A01.0', 'Contact / Food-borne', 14, 15, 'Systemic bacterial infection transmitted by ingestion of food or water contaminated with feces.'),
('Viral Hepatitis A', 'B15', 'Contact / Food-borne', 28, 10, 'Infectious liver disease caused by Hepatitis A virus; primary markers include jaundice and dark urine.');

-- 5. Insert Threshold Settings
INSERT INTO threshold_settings (disease_id, weekly_threshold, spike_percentage, is_active, notification_email) VALUES
(1, 18, 40, TRUE, 'dengue.response@healthsurveillance.org'),
(2, 28, 50, TRUE, 'respiratory.watch@healthsurveillance.org'),
(3, 12, 35, TRUE, 'waterquality.epid@healthsurveillance.org'),
(4, 5, 25, TRUE, 'measles.eradication@healthsurveillance.org'),
(5, 15, 45, TRUE, 'enteric.surveillance@healthsurveillance.org'),
(6, 10, 30, TRUE, 'hepatitis.monitor@healthsurveillance.org');

-- 6. Insert Case Reports (Spread across past 45 days)
INSERT INTO case_reports (disease_id, region_id, facility_id, report_date, case_count, severity_level, hospitalized_count, suspected_source, notes, reported_by) VALUES
-- Past 45 - 30 days (Baseline)
(1, 4, 4, DATE_SUB(CURDATE(), INTERVAL 44 DAY), 4, 'Mild', 1, 'Stagnant water near harbor drains', 'Routine seasonal vector monitoring', 2),
(2, 1, 1, DATE_SUB(CURDATE(), INTERVAL 42 DAY), 12, 'Mild', 2, 'Commuter metro stations', 'Seasonal winter temperature dip', 2),
(3, 2, 3, DATE_SUB(CURDATE(), INTERVAL 40 DAY), 3, 'Moderate', 1, 'Public borewell sample dispatched', 'Mild stomach upset cluster in ward 4', 2),
(5, 5, 7, DATE_SUB(CURDATE(), INTERVAL 38 DAY), 2, 'Moderate', 1, 'Street food vendor cluster', 'Blood culture sent for confirmation', 3),
(2, 1, 2, DATE_SUB(CURDATE(), INTERVAL 36 DAY), 15, 'Mild', 3, 'Local primary schools', 'Absenteeism survey initiated', 2),
(1, 4, 5, DATE_SUB(CURDATE(), INTERVAL 35 DAY), 6, 'Moderate', 2, 'Uncovered boat storage tanks', 'Larvicide applied in shoreline sector', 2),
(6, 6, 8, DATE_SUB(CURDATE(), INTERVAL 33 DAY), 2, 'Mild', 0, 'Farm labor canteen water', 'Liver function tests ordered', 3),
(4, 2, 10, DATE_SUB(CURDATE(), INTERVAL 30 DAY), 1, 'Severe', 1, 'Unvaccinated household cluster', 'Child under 5 years, isolated', 1),

-- Past 29 - 15 days (Rise in Dengue and Watery Diarrhea)
(1, 4, 4, DATE_SUB(CURDATE(), INTERVAL 28 DAY), 9, 'Moderate', 3, 'Coastal harbor zone residential ward', 'Fogging initiated in harbor ward', 2),
(2, 5, 7, DATE_SUB(CURDATE(), INTERVAL 27 DAY), 18, 'Mild', 2, 'Office transit complex', 'Routine influenza screening', 3),
(3, 2, 3, DATE_SUB(CURDATE(), INTERVAL 25 DAY), 8, 'Moderate', 3, 'Canal bank settlement', 'Chlorine tablets distributed to 200 households', 2),
(1, 4, 9, DATE_SUB(CURDATE(), INTERVAL 24 DAY), 14, 'Moderate', 4, 'Marshland adjacent colonies', 'Mobile unit deployed for rapid antigen testing', 2),
(5, 1, 1, DATE_SUB(CURDATE(), INTERVAL 22 DAY), 5, 'Moderate', 2, 'Central market food stall', 'Water line inspection requested to municipal board', 3),
(3, 2, 10, DATE_SUB(CURDATE(), INTERVAL 20 DAY), 11, 'Severe', 5, 'Damaged water supply pipeline near east culvert', 'Pipelines inspected by civic engineering corps', 1),
(2, 1, 1, DATE_SUB(CURDATE(), INTERVAL 19 DAY), 22, 'Moderate', 4, 'Central college campus', 'Health advisory released to universities', 2),
(1, 4, 4, DATE_SUB(CURDATE(), INTERVAL 18 DAY), 19, 'Moderate', 6, 'Dockside community', 'Threshold breach flagged for Coastal Delta', 1),
(4, 6, 8, DATE_SUB(CURDATE(), INTERVAL 16 DAY), 2, 'Moderate', 1, 'Nomadic agricultural settlement', 'Immunization drive planned with local clinic', 1),

-- Past 14 - 1 days (Significant cluster & trigger events)
(1, 4, 4, DATE_SUB(CURDATE(), INTERVAL 14 DAY), 24, 'Severe', 8, 'Coastal Delta residential clusters', 'Critical vector surge after heavy unseasonal precipitation', 1),
(1, 4, 5, DATE_SUB(CURDATE(), INTERVAL 13 DAY), 11, 'Moderate', 3, 'Fisherman village north', 'Secondary clinic reporting high fever attendance', 2),
(3, 2, 3, DATE_SUB(CURDATE(), INTERVAL 12 DAY), 16, 'Severe', 7, 'Riverside lower basin ward 12', 'Boil water notice issued by regional magistrate', 1),
(2, 1, 1, DATE_SUB(CURDATE(), INTERVAL 11 DAY), 31, 'Moderate', 6, 'Metro rail transport hub', 'Exceeded ILI weekly surveillance threshold', 2),
(2, 1, 2, DATE_SUB(CURDATE(), INTERVAL 10 DAY), 19, 'Mild', 2, 'Northside residential area', 'Home isolation advisory distributed', 2),
(5, 5, 7, DATE_SUB(CURDATE(), INTERVAL 9 DAY), 7, 'Moderate', 2, 'Fast food street hub', 'Food safety inspector visited premises', 3),
(1, 4, 9, DATE_SUB(CURDATE(), INTERVAL 8 DAY), 17, 'Severe', 5, 'Canal junction migrant shelters', 'Platelet monitoring stations set up', 1),
(3, 2, 10, DATE_SUB(CURDATE(), INTERVAL 7 DAY), 9, 'Moderate', 3, 'Pipeline repair underway', 'Residual cases tapering down after pipe repair', 2),
(6, 1, 2, DATE_SUB(CURDATE(), INTERVAL 6 DAY), 4, 'Moderate', 1, 'Private coaching institute cafeteria', 'Tap water sample collected for microbiology lab', 3),
(2, 3, 6, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 8, 'Mild', 1, 'Mountain hostel boarding school', 'Students quarantined in dormitory infirmary', 2),
(1, 4, 4, DATE_SUB(CURDATE(), INTERVAL 4 DAY), 21, 'Moderate', 6, 'Delta Port coastal sector', 'Daily door-to-door larval surveys continuing', 1),
(2, 1, 1, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 26, 'Mild', 4, 'North Metro Central', 'Steady plateau of seasonal influenza', 2),
(3, 2, 3, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 5, 'Mild', 1, 'Riverside Basin', 'Chlorination levels normalized in municipal taps', 2),
(1, 4, 9, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 15, 'Moderate', 4, 'Marshland mobile camp', 'Patients responding well to standard supportive care', 1),
(4, 2, 3, CURDATE(), 2, 'Moderate', 1, 'Riverside ward 5 nursery', 'Contact tracing underway for 14 primary contacts', 1);

-- 7. Insert Alerts (Reflecting realistic early-warning threshold breaches)
INSERT INTO alerts (disease_id, region_id, facility_id, trigger_type, severity, case_count_snapshot, threshold_snapshot, status, message, alert_date) VALUES
(1, 4, 4, 'Threshold Breach', 'Critical', 54, 18, 'Investigating', 'Unusual 200% surge in Dengue Fever cases across Coastal Delta Zone over past 10 days.', DATE_SUB(CURDATE(), INTERVAL 13 DAY)),
(3, 2, 3, 'Rapid Spike', 'High', 27, 12, 'Resolved', 'Acute Watery Diarrhea cluster detected near Riverside canal following municipal water pipe breach.', DATE_SUB(CURDATE(), INTERVAL 11 DAY)),
(2, 1, 1, 'Threshold Breach', 'Medium', 50, 28, 'New', 'Influenza-Like Illness (ILI) reports exceeded weekly threshold (50 reported vs 28 threshold).', DATE_SUB(CURDATE(), INTERVAL 10 DAY)),
(4, 2, 10, 'Cluster Detected', 'High', 3, 5, 'Investigating', 'Suspected Measles cluster in unvaccinated pediatric pocket in Riverside Basin.', DATE_SUB(CURDATE(), INTERVAL 7 DAY)),
(6, 1, 2, 'Manual Signal', 'Low', 4, 10, 'False Alarm', 'Suspected localized Hepatitis A cluster flagged by private school; non-infectious food allergen confirmed.', DATE_SUB(CURDATE(), INTERVAL 5 DAY));

-- 8. Insert Alert Reviews & Investigation Tracking Logs
INSERT INTO alert_reviews (alert_id, reviewer_id, previous_status, new_status, notes, action_taken) VALUES
(1, 1, 'New', 'Investigating', 'Dr. Radhika Sharma dispatched mobile entomology unit to Delta Port. Noted rapid larval proliferation in coastal rainwater drums.', 'Dispatched mobile unit, ordered 500 Rapid Dengue NS1 antigen kits, initiated district fogging.'),
(1, 2, 'Investigating', 'Investigating', 'Platelet stocks checked at Delta Port General Hospital. Sufficient buffer available. Larvicide distributed across 1,200 households.', 'Established 24/7 fever clinic outpost in Ward 4.'),
(2, 1, 'New', 'Investigating', 'Microbiology laboratory confirmed Vibrio cholerae negative; enterotoxigenic E. coli suspected due to sewage cross-leak.', 'Notified municipal water authority to shut down and repair sector 12 pipeline.'),
(2, 2, 'Investigating', 'Resolved', 'Pipeline repaired, hyper-chlorination completed. Water testing reveals 0 coliform count. New case incidence returned to normal baseline.', 'Boil-water notice rescinded; community health workers distributed ORS and hygiene kits.'),
(4, 1, 'New', 'Investigating', 'Contact tracing mapped 14 primary preschool contacts. 4 children overdue for MMR dose 2.', 'Scheduled emergency mop-up vaccination drive at Riverside Primary Health Center.'),
(5, 3, 'New', 'False Alarm', 'Pediatric lab results showed normal liver enzyme profiles; symptoms aligned with mild shellfish protein hypersensitivity.', 'Case closed as false alarm. School cafeteria reopened with cleared hygiene rating.');
