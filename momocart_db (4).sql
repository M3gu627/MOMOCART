-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 31, 2026 at 01:47 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `momocart_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `deposits`
--

CREATE TABLE `deposits` (
  `id` int(11) NOT NULL,
  `employee_username` varchar(100) NOT NULL,
  `deposit_date` date NOT NULL,
  `deposit_time` time NOT NULL,
  `description` varchar(255) DEFAULT '',
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL,
  `receipt_photo` mediumtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `deposits`
--

INSERT INTO `deposits` (`id`, `employee_username`, `deposit_date`, `deposit_time`, `description`, `amount`, `created_at`, `receipt_photo`) VALUES
(1, 'baliwag', '2026-03-29', '09:30:09', 'YES', 200000.00, '2026-03-29 09:30:09', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `expenses`
--

CREATE TABLE `expenses` (
  `id` bigint(20) NOT NULL,
  `employee_username` varchar(50) NOT NULL,
  `expense_date` date NOT NULL,
  `particulars` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `expenses`
--

INSERT INTO `expenses` (`id`, `employee_username`, `expense_date`, `particulars`, `amount`, `created_at`) VALUES
(1, 'trinoma', '2026-03-26', 'alchohol', 20.00, '2026-03-26 04:53:46'),
(2, 'trinoma', '2026-03-26', 'alchohol', 20.00, '2026-03-26 04:56:44'),
(3, 'trinoma', '2026-03-26', 'water', 40.00, '2026-03-26 05:30:14'),
(4, 'trinoma', '2026-03-26', 'biscuit', 7.00, '2026-03-26 23:46:54'),
(5, 'trinoma', '2026-03-28', 'hotdog', 1000.00, '2026-03-27 18:49:09'),
(6, 'trinoma', '2026-03-28', 'burger', 100.00, '2026-03-27 18:54:48'),
(7, 'trinoma', '2026-03-29', 'water', 22222.00, '2026-03-29 08:53:57');

-- --------------------------------------------------------

--
-- Table structure for table `rental_logs`
--

CREATE TABLE `rental_logs` (
  `id` bigint(20) NOT NULL,
  `employee_username` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `waiver` varchar(50) DEFAULT NULL,
  `or_number` varchar(50) DEFAULT NULL,
  `cart_number` varchar(50) DEFAULT NULL,
  `valid_id` varchar(100) DEFAULT NULL,
  `time_in` time DEFAULT NULL,
  `time_out` time DEFAULT NULL,
  `return_status` varchar(50) DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT 0.00,
  `additional_charge` decimal(10,2) DEFAULT 0.00,
  `total` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `return_time` varchar(10) DEFAULT '--:--',
  `amount_cash` decimal(10,2) DEFAULT 0.00,
  `amount_gcash` decimal(10,2) DEFAULT 0.00,
  `additional_cash` decimal(10,2) DEFAULT 0.00,
  `additional_gcash` decimal(10,2) DEFAULT 0.00,
  `id_photo` mediumtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `rental_logs`
--

INSERT INTO `rental_logs` (`id`, `employee_username`, `name`, `address`, `waiver`, `or_number`, `cart_number`, `valid_id`, `time_in`, `time_out`, `return_status`, `payment_method`, `amount`, `additional_charge`, `total`, `created_at`, `return_time`, `amount_cash`, `amount_gcash`, `additional_cash`, `additional_gcash`, `id_photo`) VALUES
(1, 'baliwag', 'Guest', NULL, 'N/A', 'N/A', 'N/A', 'Regular', '00:00:00', '00:00:00', 'Returned', NULL, 0.00, 0.00, 0.00, '2026-03-25 18:32:10', '09:46', 0.00, 0.00, 0.00, 0.00, NULL),
(2, 'baliwag', 'sample', NULL, '1', '12', 'WC 1', 'Regular', '09:56:00', '10:26:00', 'Returned', NULL, 0.00, 0.00, 100.00, '2026-03-26 02:01:13', '10:30', 0.00, 100.00, 0.00, 0.00, NULL),
(3, 'trinoma', 'SASDADAS', NULL, '1', '1', '1', 'Regular', '10:01:00', '10:31:00', 'Returned', NULL, 0.00, 0.00, 100.00, '2026-03-26 02:01:25', '10:01', 100.00, 0.00, 0.00, 0.00, NULL),
(4, 'trinoma', 'SADADS', NULL, '1', '1', '1', 'Regular', '10:02:00', '11:02:00', 'Returned', NULL, 0.00, 0.00, 150.00, '2026-03-26 02:02:15', '10:02', 0.00, 150.00, 0.00, 0.00, NULL),
(5, 'trinoma', 'sadasda', NULL, '1', '1', '1', 'Regular', '10:06:00', '12:06:00', 'Returned', NULL, 0.00, 0.00, 300.00, '2026-03-26 02:06:51', '10:06 AM', 300.00, 0.00, 0.00, 0.00, NULL),
(6, 'trinoma', 'sss', NULL, '', '', '', 'Regular', '10:58:00', '11:28:00', 'Returned', NULL, 0.00, 0.00, 0.00, '2026-03-26 02:59:03', '11:01', 0.00, 0.00, 0.00, 0.00, NULL),
(7, 'trinoma', 'ssssasdasd', NULL, '2', '2', '2', 'Regular', '10:58:00', '11:28:00', 'Returned', NULL, 0.00, 0.00, 0.00, '2026-03-26 02:59:25', '11:01', 0.00, 0.00, 0.00, 0.00, NULL),
(8, 'trinoma', 'ssssasdasd', NULL, '2', '2', '2', 'Regular', '10:58:00', '11:28:00', 'Returned', NULL, 0.00, 0.00, 0.00, '2026-03-26 02:59:38', '11:01', 0.00, 0.00, 0.00, 0.00, NULL),
(9, 'trinoma', 'asadsad', NULL, '1', '1', '1', 'Regular', '11:01:00', '12:01:00', 'Returned', NULL, 0.00, 0.00, 600.00, '2026-03-26 03:01:51', '13:54', 600.00, 0.00, 0.00, 0.00, NULL),
(10, 'trinoma', 'sadasdasasasa', NULL, '1', '1', '1', 'Senior', '11:06:00', '12:06:00', 'Returned', NULL, 0.00, 0.00, 160.00, '2026-03-26 03:06:15', '11:06', -1.00, 120.00, 0.00, 40.00, NULL),
(11, 'trinoma', 'sdasdasxcxxx', NULL, '1', '1', '1', 'PWD', '11:12:00', '11:42:00', 'Returned', NULL, 0.00, 0.00, 100.00, '2026-03-26 03:12:57', '13:54', -1.00, 100.00, 0.00, 0.00, NULL),
(12, 'trinoma', 'sdasdasxcxxxasdasd', NULL, '2', '2', '1', 'Regular', '11:12:00', '00:00:00', 'Returned', NULL, 0.00, 0.00, 600.00, '2026-03-26 03:13:22', '13:54', -1.00, -1.00, 0.00, 0.00, NULL),
(13, 'trinoma', 'sdasdasxcxxxasdasdsdasax', NULL, '22', '22', '12', 'Senior', '11:13:00', '00:00:00', 'Returned', NULL, 0.00, 0.00, 550.00, '2026-03-26 03:13:58', '13:54', -1.00, 550.00, 0.00, 0.00, NULL),
(14, 'trinoma', 'asdasdadsxxx', NULL, 'sss', '1', '1', 'PWD', '20:11:00', '23:11:00', 'Returned', NULL, 0.00, 0.00, 300.00, '2026-03-27 12:12:03', '02:27', 300.00, -1.00, 0.00, 0.00, NULL),
(15, 'trinoma', 'sdasda', NULL, '1', 'asd', 'ads', 'Regular', '02:47:00', '05:47:00', 'Returned', NULL, 0.00, 0.00, 450.00, '2026-03-27 18:47:17', '02:56', 450.00, -1.00, 0.00, 0.00, NULL),
(16, 'trinoma', 'dsadad', NULL, 'ada', 'asda', 'ada', 'Regular', '02:47:00', '05:47:00', 'Returned', NULL, 0.00, 0.00, 450.00, '2026-03-27 18:47:29', '02:55', 450.00, -1.00, 0.00, 0.00, NULL),
(18, 'trinoma', 'sdadsaassss', NULL, 'asdad', 'asdad', '1', 'Regular', '02:50:00', '05:50:00', 'Returned', NULL, 0.00, 0.00, 450.00, '2026-03-27 18:50:48', '02:56', 450.00, -1.00, 0.00, 0.00, NULL),
(20, 'trinoma', 'sss', 'ss', 'sss2', 'ss', 's', 'Regular', '21:50:00', '22:20:00', 'Pending', NULL, 0.00, 0.00, 100.00, '2026-03-28 13:50:45', '22:50', 100.00, -1.00, 0.00, 0.00, NULL),
(25, 'trinoma', 'hello', 's', 's', 's', '', 'Regular', '09:51:00', '00:00:00', 'Pending', NULL, 0.00, 0.00, 600.00, '2026-03-29 01:51:28', '09:51', 600.00, -1.00, 0.00, 0.00, NULL),
(26, 'trinoma', 'ss', 'sss', 'sss', 'sss', '', 'Regular', '09:51:00', '10:21:00', 'Returned', NULL, 0.00, 0.00, 100.00, '2026-03-29 01:51:42', '09:51', 100.00, -1.00, 0.00, 0.00, NULL),
(27, 'trinoma', 'sss22', 'ssss', 'sss', 'sss', '2', 'Regular', '09:53:00', '10:23:00', 'Pending', NULL, 0.00, 0.00, 100.00, '2026-03-29 01:53:36', '11:53', 100.00, -1.00, 0.00, 0.00, NULL),
(28, 'trinoma', 's', 's', 's', 's', 's', 'Regular', '09:54:00', '11:54:00', 'Pending', NULL, 0.00, 0.00, 300.00, '2026-03-29 01:54:31', '00:54', 300.00, -1.00, 0.00, 0.00, NULL),
(29, 'trinoma', 'Jaybi', 'asdadsa', 'dsadad', 'asdada', 'adsad', 'Regular', '13:43:00', '14:13:00', 'Pending', NULL, 0.00, 0.00, 100.00, '2026-03-29 05:43:29', '13:43', 100.00, -1.00, 0.00, 0.00, NULL),
(34, 'trinoma', 'asdadsa', 'asdadsa', '', '', '1', 'Regular', '00:00:00', '00:00:00', 'Pending', NULL, 0.00, 0.00, 100.00, '2026-03-31 11:24:35', '', 100.00, -1.00, 0.00, 0.00, 'data:image/jpeg;base64,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');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','employee') NOT NULL,
  `display_name` varchar(100) NOT NULL,
  `avatar` varchar(10) NOT NULL,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password`, `role`, `display_name`, `avatar`, `updated_at`) VALUES
(1, 'admin', '$2y$10$SUtWSPo2LqigROZMkeH3fuqTd1V8cQwoEfqlFNen4D.hAmumsLabW', 'admin', 'Admin', '👑', '2026-03-31 11:46:58'),
(2, 'pampanga', '$2y$10$kC/zyu.0k4IJxdhJY7hA/ePAyILNS0ogN9yX.uuWi5NpYNo7sPlg.', 'employee', 'Pampanga Branch', '👷', '2026-03-31 11:46:58'),
(3, 'baliwag', '$2y$10$dTfjuYRX.IuCdjv5UE5t2eLJ/w9NuamWL1uDLGAx1Ne4bRJNnVeXW', 'employee', 'Baliwag Branch', '👷', '2026-03-31 11:46:58'),
(4, 'trinoma', '$2y$10$fsXbXuyzUHhINk2mgI/20OIU9q/GNzNBPG/rkxETsLYjw2/WkL9na', 'employee', 'Trinoma Branch', '👷', '2026-03-31 11:46:58'),
(13, 'smartwheels', '$2y$10$4ZYrqyJXQKO5t/o0CK1io.AVdYpyNITb7aJEqhQXladYEzB5z9lyq', 'employee', 'Smart Wheels Branch', '', '2026-03-31 11:46:58'),
(14, 'bataan', '$2y$10$LiMoMuMR/Rwyir.PHlanZOAMRE/kKXjvbdMqHUhdFawSdpGudOIMu', 'employee', 'Bataan Branch', '', '2026-03-31 11:46:58');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `deposits`
--
ALTER TABLE `deposits`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `expenses`
--
ALTER TABLE `expenses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `employee_username` (`employee_username`);

--
-- Indexes for table `rental_logs`
--
ALTER TABLE `rental_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `rental_logs_ibfk_1` (`employee_username`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `deposits`
--
ALTER TABLE `deposits`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `expenses`
--
ALTER TABLE `expenses`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `rental_logs`
--
ALTER TABLE `rental_logs`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=43;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `expenses`
--
ALTER TABLE `expenses`
  ADD CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`employee_username`) REFERENCES `users` (`username`) ON UPDATE CASCADE;

--
-- Constraints for table `rental_logs`
--
ALTER TABLE `rental_logs`
  ADD CONSTRAINT `rental_logs_ibfk_1` FOREIGN KEY (`employee_username`) REFERENCES `users` (`username`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
