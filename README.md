# Fridge Tracker 
*The smart way to manage your kitchen inventory.*

Fridge Tracker is a lightweight, offline-first PWA designed to run on a dedicated kitchen device. It helps you keep track of what's in your fridge, monitors expiration dates, and suggests meals to minimize food waste.

https://locatellimattia.github.io/Fridge_Tracker/

---

### 🚀 Development Status
We are currently in **Phase 4: Smart Recommendation Engine**.

| Phase | Feature | Status |
| :--- | :--- | :--- |
| **1** | Field Validation & Kiosk Setup | ✅ Done |
| **2** | Editing, Consumption, Search & Drag & Drop | ✅ Done |
| **3** | Backup & Restore (JSON Import/Export) | ✅ Done |
| **4** | Smart Recommendation Engine | 🚧 In Progress |
*Note: The balanced meal suggestion engine uses a heuristic approach and is currently being refined. This is not medical advice; please use your judgment when following suggestions.*
| **5** | OCR Expiry Date Scanning | ⏳ Planned |
| **6** | Service Worker Robustness | ✅ Done |
| **7** | Multi-device Sync | ❌ Future |

---

### 📖 How to Use It
1.  **Add Items**: Go to the **"Aggiungi"** tab. Use your tablet's camera to scan a barcode or enter the product manually.
2.  **View Inventory**: Check the **"Dispensa"** tab to see all your items, organized by categories and sorted by expiration date. You can also drag & drop items to move them between categories.
3.  **Edit & Consume**:
    *   Tap **"Consuma"** on any item to record partial consumption.
    *   Tap **"Modifica"** to edit an existing item's details (name, expiry, quantity, category, etc.).
4.  **Meal Ideas**: Check the **"Cosa mangio"** tab for suggestions based on what's in your fridge.
5.  **Backup & Restore**: Go to the **"Impostazioni"** tab to export your data as a JSON file or restore a previous backup.

---

### 📋 Planned Roadmap
We are building this app one step at a time:
*   **🧠 Intelligent Recommendations**: A custom heuristic engine to suggest balanced meals (e.g., protein + fiber).
*   **📷 OCR Date Scanning**: Automated scanning of printed expiration dates using `Tesseract.js`.
*   **💾 Backup & Restore**: Secure export/import of your fridge data to prevent loss.
*   **🌐 Sync**: Potential migration to a backend if multi-device access becomes necessary.

---

### ⚠️ Disclaimer & License
This project is for **personal, non-commercial use only**.
I do not grant any permission for commercial use, distribution, or reproduction of this application for profit. 

The source code is released under the **MIT License**, with the explicit restriction that **any commercial exploitation is strictly prohibited** without my express written consent.
