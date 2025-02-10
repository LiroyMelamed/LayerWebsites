# **LayerWebsites** 🏛️  
A **React + Node.js** based lawyer management system with **Azure SQL Database** integration.  
Clients can upload necessary files and track their cases efficiently.

---

## **📌 Project Structure**
```
LayerWebsites/
│── frontend/       # React-based client
│── backend/        # Node.js Express API
│── README.md       # Project documentation
│── .env            # Environment variables (not committed)
```

---

## **🚀 Features**
✅ **Authentication & OTP Login** – Secure login using phone number OTP  
✅ **Case Management** – Create, update, and track cases  
✅ **Customer Management** – View and manage clients  
✅ **SQL Azure Integration** – Uses **Microsoft SQL Server** for data persistence  

---

## **🔧 Setup & Installation**

### **1️⃣ Clone the repository**
```bash
git clone https://github.com/LiroyMelamed/LayerWebsites.git
cd LayerWebsites
```

### **2️⃣ Backend Setup**
1. Navigate to the backend:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file:
   ```env
   PORT=5000
   DB_USER=your_sql_username
   DB_PASSWORD=your_sql_password
   DB_SERVER=your_sql_server.database.windows.net
   DB_NAME=your_database_name
   JWT_SECRET=your_secret_key
   ```
4. Start the backend server:
   ```bash
   node server.js
   ```
   ✅ Server should run at `http://localhost:5000`

### **3️⃣ Frontend Setup**
1. Navigate to the frontend:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file:
   ```env
   REACT_APP_API_BASE_URL=http://localhost:5000
   ```
4. Start the frontend:
   ```bash
   npm start
   ```
   ✅ React app should run at `http://localhost:3000`

---

## **📡 API Endpoints**

### **🔹 Authentication**
| Method | Endpoint       | Description |
|--------|---------------|-------------|
| `POST` | `/RequestOtp`  | Sends OTP to the user |
| `POST` | `/VerifyOtp`   | Verifies OTP and returns JWT |

### **🔹 Cases**
| Method | Endpoint           | Description |
|--------|-------------------|-------------|
| `GET`  | `/GetCases`       | Retrieve all cases |
| `GET`  | `/GetCase/:caseId` | Retrieve a specific case |
| `POST` | `/AddCase`        | Create a new case |
| `PUT`  | `/UpdateCase/:caseId` | Update a case |

### **🔹 Customers**
| Method | Endpoint            | Description |
|--------|--------------------|-------------|
| `GET`  | `/GetCustomers`     | Retrieve all customers |
| `POST` | `/AddCustomer`      | Create a new customer |
| `PUT`  | `/GetCustomer/:customerId` | Update customer details |

### **🔹 Case Types**
| Method | Endpoint             | Description |
|--------|---------------------|-------------|
| `GET`  | `/GetCasesType`     | Retrieve all case types |
| `GET`  | `/GetCaseType/:caseTypeId` | Retrieve a specific case type |
| `POST` | `/AddCaseType`      | Create a new case type |
| `PUT`  | `/UpdateCaseType/:caseTypeId` | Update case type details |

### **🔹 Dashboard Data**
| Method | Endpoint               | Description |
|--------|-----------------------|-------------|
| `GET`  | `/GetMainScreenData`   | Retrieve main dashboard data |

---

## **📜 License**
This project is licensed under the **MIT License**.

---

## **💡 Additional Notes**
- Ensure you **configure the `.env` file** correctly before running the project.
- Make sure **SQL Azure is accessible** and properly connected.
- Use **Postman or curl** to test APIs before integrating with the frontend.

🚀 **Enjoy building with LayerWebsites!**