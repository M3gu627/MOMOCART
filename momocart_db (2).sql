-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 28, 2026 at 02:51 PM
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
(6, 'trinoma', '2026-03-28', 'burger', 100.00, '2026-03-27 18:54:48');

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
  `additional_gcash` decimal(10,2) DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `rental_logs`
--

INSERT INTO `rental_logs` (`id`, `employee_username`, `name`, `address`, `waiver`, `or_number`, `cart_number`, `valid_id`, `time_in`, `time_out`, `return_status`, `payment_method`, `amount`, `additional_charge`, `total`, `created_at`, `return_time`, `amount_cash`, `amount_gcash`, `additional_cash`, `additional_gcash`) VALUES
(1, 'baliwag', 'Guest', NULL, 'N/A', 'N/A', 'N/A', 'Regular', '00:00:00', '00:00:00', 'Returned', NULL, 0.00, 0.00, 0.00, '2026-03-25 18:32:10', '09:46', 0.00, 0.00, 0.00, 0.00),
(2, 'baliwag', 'sample', NULL, '1', '12', 'WC 1', 'Regular', '09:56:00', '10:26:00', 'Returned', NULL, 0.00, 0.00, 100.00, '2026-03-26 02:01:13', '10:30', 0.00, 100.00, 0.00, 0.00),
(3, 'trinoma', 'SASDADAS', NULL, '1', '1', '1', 'Regular', '10:01:00', '10:31:00', 'Returned', NULL, 0.00, 0.00, 100.00, '2026-03-26 02:01:25', '10:01', 100.00, 0.00, 0.00, 0.00),
(4, 'trinoma', 'SADADS', NULL, '1', '1', '1', 'Regular', '10:02:00', '11:02:00', 'Returned', NULL, 0.00, 0.00, 150.00, '2026-03-26 02:02:15', '10:02', 0.00, 150.00, 0.00, 0.00),
(5, 'trinoma', 'sadasda', NULL, '1', '1', '1', 'Regular', '10:06:00', '12:06:00', 'Returned', NULL, 0.00, 0.00, 300.00, '2026-03-26 02:06:51', '10:06 AM', 300.00, 0.00, 0.00, 0.00),
(6, 'trinoma', 'sss', NULL, '', '', '', 'Regular', '10:58:00', '11:28:00', 'Returned', NULL, 0.00, 0.00, 0.00, '2026-03-26 02:59:03', '11:01', 0.00, 0.00, 0.00, 0.00),
(7, 'trinoma', 'ssssasdasd', NULL, '2', '2', '2', 'Regular', '10:58:00', '11:28:00', 'Returned', NULL, 0.00, 0.00, 0.00, '2026-03-26 02:59:25', '11:01', 0.00, 0.00, 0.00, 0.00),
(8, 'trinoma', 'ssssasdasd', NULL, '2', '2', '2', 'Regular', '10:58:00', '11:28:00', 'Returned', NULL, 0.00, 0.00, 0.00, '2026-03-26 02:59:38', '11:01', 0.00, 0.00, 0.00, 0.00),
(9, 'trinoma', 'asadsad', NULL, '1', '1', '1', 'Regular', '11:01:00', '12:01:00', 'Returned', NULL, 0.00, 0.00, 600.00, '2026-03-26 03:01:51', '13:54', 600.00, 0.00, 0.00, 0.00),
(10, 'trinoma', 'sadasdasasasa', NULL, '1', '1', '1', 'Senior', '11:06:00', '12:06:00', 'Returned', NULL, 0.00, 0.00, 160.00, '2026-03-26 03:06:15', '11:06', -1.00, 120.00, 0.00, 40.00),
(11, 'trinoma', 'sdasdasxcxxx', NULL, '1', '1', '1', 'PWD', '11:12:00', '11:42:00', 'Returned', NULL, 0.00, 0.00, 100.00, '2026-03-26 03:12:57', '13:54', -1.00, 100.00, 0.00, 0.00),
(12, 'trinoma', 'sdasdasxcxxxasdasd', NULL, '2', '2', '1', 'Regular', '11:12:00', '00:00:00', 'Returned', NULL, 0.00, 0.00, 600.00, '2026-03-26 03:13:22', '13:54', -1.00, -1.00, 0.00, 0.00),
(13, 'trinoma', 'sdasdasxcxxxasdasdsdasax', NULL, '22', '22', '12', 'Senior', '11:13:00', '00:00:00', 'Returned', NULL, 0.00, 0.00, 550.00, '2026-03-26 03:13:58', '13:54', -1.00, 550.00, 0.00, 0.00),
(14, 'trinoma', 'asdasdadsxxx', NULL, 'sss', '1', '1', 'PWD', '20:11:00', '23:11:00', 'Returned', NULL, 0.00, 0.00, 300.00, '2026-03-27 12:12:03', '02:27', 300.00, -1.00, 0.00, 0.00),
(15, 'trinoma', 'sdasda', NULL, '1', 'asd', 'ads', 'Regular', '02:47:00', '05:47:00', 'Returned', NULL, 0.00, 0.00, 450.00, '2026-03-27 18:47:17', '02:56', 450.00, -1.00, 0.00, 0.00),
(16, 'trinoma', 'dsadad', NULL, 'ada', 'asda', 'ada', 'Regular', '02:47:00', '05:47:00', 'Returned', NULL, 0.00, 0.00, 450.00, '2026-03-27 18:47:29', '02:55', 450.00, -1.00, 0.00, 0.00),
(18, 'trinoma', 'sdadsaassss', NULL, 'asdad', 'asdad', '1', 'Regular', '02:50:00', '05:50:00', 'Returned', NULL, 0.00, 0.00, 450.00, '2026-03-27 18:50:48', '02:56', 450.00, -1.00, 0.00, 0.00),
(20, 'trinoma', 'sss', 'ss', 'sss', 'ss', 's', 'Regular', '21:50:00', '22:20:00', 'Pending', NULL, 0.00, 0.00, 100.00, '2026-03-28 13:50:45', '22:50', 100.00, -1.00, 0.00, 0.00);

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
(1, 'admin', '$2y$10$GAjPt5RikcCC2P5/V6OWCumRBbdh4BJz02S0dBMID9LeoI3pHAkly', 'admin', 'Admin', '👑', '2026-03-26 17:33:55'),
(2, 'pampanga', '$2y$10$nK4Wed/1fo9uSgpPfnYdSePZQAb/HP2DRLjF/CTeuh3JsV.GX4BGa', 'employee', 'Pampanga Branch', '👷', '2026-03-26 17:33:55'),
(3, 'baliwag', '$2y$10$E.wQXl91xUy09zwm4qC7cO3qnJdcAx2S/iFyH0necHvKCSh./oRoG', 'employee', 'Baliwag Branch', '👷', '2026-03-26 17:33:55'),
(4, 'trinoma', '$2y$10$SdR7eIZG4Mf2uiEvhAXTCuv6vMh.YMYXteKS8j19yhh7nlcFaeKhq', 'employee', 'Trinoma Branch', '👷', '2026-03-26 17:33:55'),
(13, 'smartwheels', '$2y$10$REPLACE_WITH_REAL_HASH_FOR_SMARTWHEELS', '', 'Smart Wheels', '', NULL),
(14, 'bataan', '$2y$10$REPLACE_WITH_REAL_HASH_FOR_BATAAN', '', 'Bataan', '', NULL);

--
-- Indexes for dumped tables
--

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
-- AUTO_INCREMENT for table `expenses`
--
ALTER TABLE `expenses`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `rental_logs`
--
ALTER TABLE `rental_logs`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

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
