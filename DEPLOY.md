
# AutoSocial AI 部署與營運手冊

本文件說明如何將 AutoSocial AI 部署至正式環境，並採用 **「現金收費、手動開通」** 的營運模式。

---

## 1. 系統架構概念

本系統採用 **前後端分離** 架構，確保安全性與擴充性：

*   **前端 (Frontend)**: React 網站。負責畫面呈現，建議部署於 **Vercel** 或 **Netlify**。
*   **後端 (Backend)**: Node.js 伺服器 (選擇性)。負責處理高敏操作，部署於 **Render** 或 **Cloud Run**。
*   **資料庫 (Database)**: **Google Firebase**。負責集中儲存所有會員資料、貼文紀錄與狀態。

---

## 2. Gemini API Key 設定 (最重要的步驟 🔑)

Q: **Gemini API Key 要從哪裡輸入？**

**A: 必須設定在「環境變數 (Environment Variables)」中。**

*   ❌ **絕對禁止** 將 API Key 直接寫死在程式碼中 (例如 `const key = "AIza..."`)，這會導致 Key 被盜用。
*   ✅ **正確做法**：
    *   **前端部署 (Vercel/Netlify)**: 在平台的 "Settings" -> "Environment Variables" 中設定 `VITE_API_KEY`。
    *   **後端部署 (Render/Cloud Run)**: 同樣在平台的環境變數設定區塊輸入 `API_KEY`。

---

## 3. 故障排除：API Key 讀取不到？

如果你在 Vercel 設定了變數，但網站還是顯示「缺少 API Key」或 `MISSING`，請檢查以下幾點：

1.  **變數名稱是否正確？** 前端必須使用 `VITE_API_KEY` (要有 `VITE_` 前綴)。
2.  **是否有重新部署 (Redeploy)？** (最常見的原因 ⚠️)
    *   Vercel 的環境變數是在「打包 (Build)」時寫入的。
    *   如果你在設定變數之前就已經部署過，**新的變數不會自動生效**。
    *   **解決方法**：去 Vercel -> Deployments -> 點選最新的部署右邊的三個點 -> 選擇 **Redeploy**。

3.  **是否有空白鍵？** 複製貼上時，有時候會不小心多複製到前後的空白，系統已加入自動去除空白的功能，但建議檢查一下 Vercel 後台的值。

---

## 4. 會員資料存放在哪裡？ (Data Source)

Q: **用戶註冊後，會員資料會集中在哪裡？**

**A: 所有資料會集中儲存在 Google Firebase 的 Firestore 資料庫中。**

當你完成 `services/firebase.ts` 的設定後，所有註冊用戶的 Email、密碼(加密後)、以及你會員等級(Role)、配額(Quota) 都會即時同步到 Google 雲端。

你可以透過兩個地方查看與管理資料：

### 方法一：網站內的「管理員後台」 (推薦 👍)
這是最簡單的方式。只要你的帳號是 Admin 權限，登入網站後點選左側選單的 **「👮 管理員後台」**，即可看到所有註冊會員列表，並直接在介面上修改他們的等級與額度。

### 方法二：Firebase Console (原始資料)
如果你需要查看最原始的資料：
1.  前往 [Firebase Console](https://console.firebase.google.com/)。
2.  點選你的專案 -> **Firestore Database**。
3.  你會看到一個 `users` 的集合 (Collection)，裡面每一筆文件就是一位會員的詳細資料。

---

## 5. 會員制度串接 (現金收費模式 💰)

針對你的需求：「不串接複雜金流，直接收現金/轉帳，手動開通」。

### 營運流程 SOP：

1.  **用戶註冊**：
    *   請客戶直接在你的網站使用 Email 註冊一個帳號。
    *   此時他預設是 `User` (免費版) 角色，配額有限 (例如 5 點)。

2.  **線下付款**：
    *   客戶透過轉帳、現金或 Line Pay 付款給你。
    *   客戶告知你他的註冊 Email。

3.  **管理員開通 (你的工作)**：
    *   使用你的管理員帳號登入網站。
    *   進入 **「👮 管理員後台」**。
    *   點選 **「👥 會員管理」**。
    *   在搜尋框輸入客戶的 Email。
    *   **方案 A (月費制/升級)**：將角色 (Role) 下拉選單從 `User` 改為 `VIP`。系統會自動將他的配額上限調高 (例如 1000 點)。
    *   **方案 B (儲值制)**：直接點擊「配額」旁的 ✎ 按鈕，手動修改 `Quota Total` (例如手動加 500 點)。

4.  **完成**：
    *   客戶重新整理網頁，即可看到額度已更新。

---

## 6. 快速部署步驟 (Frontend + Firebase)

這是最快讓網站上線的方式：

1.  **建立 Firebase 專案**：
    *   去 [Firebase Console](https://console.firebase.google.com/) 建立專案。
    *   開啟 **Authentication** (啟用 Email/Password)。
    *   開啟 **Firestore Database** (建立資料庫)。
    *   在 "Project Settings" 下載 Web App 的設定 (`apiKey`, `projectId` 等)。

2.  **設定 Vercel 部署**：
    *   將程式碼上傳到 GitHub。
    *   在 Vercel 匯入專案。
    *   **設定環境變數 (Environment Variables)**：
        *   將 Firebase 的設定填入 (使用 `VITE_FIREBASE_API_KEY` 等名稱)。
        *   填入 `VITE_API_KEY` (你的 Gemini API Key)。

3.  **部署 (Deploy)**：
    *   點擊 Deploy，等待幾分鐘，你的網站就上線了！
