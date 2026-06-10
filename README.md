# Truliva Service Management & Order Sync System

[![System](https://img.shields.io/badge/System-Truliva%20Manager-blue)](#)
[![Framework](https://img.shields.io/badge/Framework-Node.js%20%7C%20React%20%7C%20Capacitor-orange)](#)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%7C%20Prisma-green)](#)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

This repository contains the complete source code for **Truliva**, a production-grade Field Service Management (FSM) and Mini-ERP system. It automates technical service dispatching, smart inventory tracking, and real-time order synchronization with the **Pancake POS** platform.

The system is currently in active production, supporting **90 active enterprise users** (including **78 on-field technicians (KTV)**, dispatchers, sales representatives, and administrators) in their daily operations.

---

## Table of Contents
- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [System Architecture & Tech Stack](#-system-architecture--tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Installation & Environment Configuration](#-installation--environment-configuration)
- [Quick Start](#-quick-start)
- [Mobile App Packaging (Capacitor Android)](#-mobile-app-packaging-capacitor-android)
- [Deployment](#-deployment)
- [📚 References & Documentation](#-references--documentation)

---

## 📚 References & Documentation

Key technical documentation files for system maintainers and developers:

| Document | Description |
|---|---|
| [API.md](API.md) | Full API endpoint documentation: permissions, parameters, request/response examples, and business logic notes |
| [.env.example](.env.example) | Environment variables template with detailed comments for local and production deployment |

---

## Project Overview

**Truliva** is a closed-loop operations solution designed for enterprises offering home-based technical services (such as water purifier installation, appliance maintenance, household repairs, and periodic filter replacements). The system is directly integrated with **Pancake POS** via real-time Webhooks and automated synchronization APIs.

### Standard Operational Flow:
1. **Admin / Coordinator Panel (Operational Dispatch & Inventory):**
   - Automatically ingest orders from Pancake POS webhooks or manually create service tickets.
   - Visually check real-time product inventory availability at the designated warehouse (Green/Yellow/Red indicators).
   - Assign and dispatch local KTVs using smart regional station routing suggestions.
2. **Technician Webapp / Mobile Client (PWA/Capacitor):**
   - Receive instant job assignments via native and browser Push Notifications (FCM / Web Push).
   - View details through a mobile-optimized vertical Card List interface.
   - Access quick actions: Dial customer phone numbers (automatically copied to clipboard), reschedule appointments, and submit field service reports (attaching photographs, recording TDS water values, water source, and replacement parts).

---

## Key Features

### 1. Real-time Two-Way Sync (Pancake POS ↔ Webapp)
- **Webhook Integration**: Real-time listening for Pancake POS order events to keep local database orders in sync.
- **Bi-directional Inventory Sync**: Selecting a warehouse on Truliva triggers a corresponding warehouse update request to Pancake POS to automatically deduct stock.
- **Bi-directional Status Sync**: Changing order status to `completed` or `cancelled` on the local admin panel automatically updates the corresponding order status on Pancake POS to `Delivered` or `Cancelled`.
- **Auto-Sync Fallback Scheduler**: Background cron process that scans recent Pancake orders every 5 minutes to prevent data loss.

### 2. Smart Dispatching & Station Management
- **Multi-Level Stations**: Organize technicians under Main Stations and Local Tech Stations.
- **Technician Suggestion Engine**: Recommends the best KTV based on Tech Station proximity and current workload (number of pending orders).

### 3. Advanced PWA & Mobile Client for KTVs
- **Vertical Card Layout**: Optimized for mobile viewports, displaying customer information, shipping addresses, job types, and notes using clear, intuitive icons (`User`, `MapPin`, `Clock`, `Wrench`, `MessageSquare`).
- **Persistent Session Auth**: Combines JWT Bearer tokens with localStorage to prevent WebView session expiration on KTV devices.
- **Field Reporting**: Technicians submit serial numbers, TDS water levels, water pressure, used spare parts, and upload proof-of-work images directly to Cloudinary.

### 4. Rich Analytical Dashboard
- **Geographical Density Map**: Dynamic SVG-based interactive map of Vietnam visualizing order densities per province.
- **On-Time Performance KPIs**: Calculates delay rates and average completion times based on KTV reports versus appointment schedules.
- **Product Quality & Machine Lifecycle**: Tracks machine durability and days-to-failure using serial number history analysis.

---

## System Architecture & Tech Stack

The system is built on a modern Client-Server model with a clean separation between the Backend API and the Frontend Single Page Application (SPA):

```mermaid
graph TD
    A["Pancake POS API / Webhook"] <-->|Order & Stock Sync| B["Node.js Express Backend"]
    B <-->|Prisma Client| C[("PostgreSQL Database")]
    B -->|Firebase Admin SDK| D["Firebase Cloud Messaging"]
    B -->|Web-Push| E["PWA Push Service"]
    B <-->|REST API / Bearer Token| F["React TS Webapp Client"]
    F -->|Capacitor Native Bridge| G["Capacitor Android Webview"]
    D -->|Push Notification| G
    E -->|Push Notification| F
```

### Tech Stack
*   **Backend Engine**: Node.js (Express), TypeScript
*   **Database & ORM**: PostgreSQL (Neon Cloud), Prisma ORM
*   **Push Notifications**: Firebase Admin SDK (for native app), Web-Push (for PWA web clients)
*   **Frontend Webapp**: React, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts
*   **Mobile Wrapper**: Capacitor CLI (packaging web app source into native Android APK)
*   **Cloud Integrations**: Render (Web Hosting), Cloudinary (media upload)

---

## Project Directory Structure

```text
.
├── src/                      # Backend Source Code (Express)
│   ├── config/               # DB config, Firebase setup, mailer configurations...
│   ├── middleware/           # Auth middlewares, request logging...
│   ├── routes/               # API endpoint definitions (auth, orders, reports, webhooks...)
│   ├── services/             # Core business logic (sync schedulers, notifications, order processing...)
│   ├── utils/                # General helpers (logger, mailer...)
│   └── index.ts              # Server Entry Point
├── prisma/                   # Prisma ORM Configuration
│   └── schema.prisma         # Database Models
├── webapp/                   # Frontend Source Code (React Single Page Application)
│   ├── src/
│   │   ├── api/              # API Client (client.ts)
│   │   ├── components/       # Reusable UI components
│   │   ├── context/          # Global Contexts (AuthContext.tsx)
│   │   ├── pages/            # View Pages (KTV views, Admin panels, Auth screens...)
│   │   ├── utils/            # Helpers for text formats, order currency, etc.
│   │   ├── App.tsx           # Router and Main Structure
│   │   └── main.tsx          # Frontend Entry Point
│   ├── package.json          # Webapp configuration file
│   ├── vite.config.ts        # Vite Bundler config
│   └── tsconfig.json         # Frontend TypeScript configuration
├── package.json              # Root package configuration (concurrent frontend/backend runner)
├── render.yaml               # Infrastructure-as-Code deployment template for Render
└── tsconfig.json             # Backend TypeScript configuration
```

---

## Installation & Environment Configuration

### 1. System Requirements
*   **Node.js**: Version 18.x or higher
*   **PostgreSQL**: Active PostgreSQL instance (or Neon Cloud account)
*   **Package Manager**: npm (bundled with Node.js)

### 2. Dependency Installation
Run the install command in the root directory:
```bash
npm install
```

### 3. Environment Variables setup
Create a `.env` file in the root directory based on the `.env.example` file:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=verify-full"

# API & Webhook Security Keys
PANCAKE_WEBHOOK_SECRET="your-webhook-secret"
JWT_SECRET="your-jwt-secret-key"
PANCAKE_API_KEY="your-pancake-api-key"

# Cloudinary (Image Uploads)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Email Configuration (SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE="false"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM_NAME="Truliva System"
APP_URL="http://localhost:3000"

# VAPID Keys (PWA Web Push)
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"
VAPID_SUBJECT="mailto:your-email@gmail.com"

# Firebase Cloud Messaging
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="your-firebase-client-email"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----\n"
```

---

## Quick Start

### 1. Database Synchronization
Generate the Prisma client and push the schema models to the PostgreSQL database:
```bash
npx prisma generate
npx prisma db push
```

### 2. Run in Development Mode
Launch both the Backend server (port 3000) and the Frontend Vite Dev Server (port 5173) concurrently:
```bash
npm run dev
```

### 3. Build for Production
Compile both the frontend webapp and backend express server:
```bash
npm run build
```

---

## Mobile App Packaging (Capacitor Android)

To package and generate the native Android package (APK file) for technicians:

### 1. Sync Frontend Build Assets with Capacitor
```bash
cd webapp
npm run build
npx cap sync android
```

### 2. Compile APK
*   **Method 1**: Open `webapp/android` in **Android Studio**, then run `Build > Build Bundle(s) / APK(s) > Build APK(s)`.
*   **Method 2** (Via Command Line):
    ```powershell
    cd webapp/android
    .\gradlew.bat assembleDebug
    ```
    *The generated APK will be stored at: `webapp/android/app/build/outputs/apk/debug/app-debug.apk`*

---

## Deployment

The repository is configured for automated deployments to **Render** using the Infrastructure-as-Code file `render.yaml`. Linking this repository to Render will automatically provision the environment and build the services.
