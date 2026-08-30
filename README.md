# NextID (rAnalyzer) — Enterprise Identity Governance & Administration (IGA) Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
[![Tests](https://img.shields.io/badge/Tests-32%2F32%20Passed-success.svg)]()
[![Docker Ready](https://img.shields.io/badge/Docker-Compose%20Ready-blue.svg)]()

**NextID** (rAnalyzer) is a state-of-the-art, open-stack Enterprise Identity Governance & Administration (IGA) platform. It provides end-to-end identity lifecycle management (Joiner, Mover, Leaver), Segregation of Duties (SoD) policy enforcement, risk-based multi-step approval workflows, access certification campaigns, emergency Break-Glass JIT access, temporal credential lineage tracking, real-time cascade revocation, and automated compliance report generation (SOX, SOC2, ISO27001, HIPAA).

---

## 🚀 Key Features & Capabilities

### 1. Identity Lifecycle Management (JML Engine)
- **Joiner Workflow**: Auto-provisions new identities with default birthright access and initial authority epoch (`authority_epoch=1`).
- **Mover Workflow**: Handles department and role changes, increments authority epoch, re-evaluates birthright policies, and revokes obsolete role entitlements.
- **Leaver Workflow**: Fail-closed identity suspension, immediate freeze of connected accounts, and termination of active JIT leases.
- **SCIM 2.0 Provisioning Connector**: Standardized inbound/outbound SCIM 2.0 provisioning connector supporting user creation, attribute patching, account disabling, and state verification.

### 2. Requestable Access Catalog & Access Requests
- **Access Catalog**: Self-service catalog publishing with risk classifications (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), default and max TTL bounds, and justification rules.
- **Access Request Lifecycle**: End-to-end request submission, business justification capture, risk-based approval routing, and cancellation state transitions.

### 3. Risk-Based Multi-Step Approval Workflows
- **Dynamic Approval Chains**: Automatically generates required approval steps based on catalog risk levels (e.g., Application Owner + Security Admin for `CRITICAL` items).
- **Maker-Checker Guardrails**: Prevents self-approval and enforces segregation of duties between requester and approver.

### 4. Segregation of Duties (SoD) Engine
- **Conflict Evaluation**: Detects toxic entitlement pairings (e.g., Accounts Payable Entry vs. Payment Release) using `AND`/`OR` conditions.
- **SoD Exception Management**: Allows time-bound, approved compliance exceptions with automatic expiration tracking.

### 5. Access Certification & Recertification Campaigns
- **Campaign State Machine**: Supports `DRAFT` $\rightarrow$ `ACTIVE` $\rightarrow$ `COMPLETED` campaign lifecycles for privileged access reviews.
- **Evidence-Backed Reviews**: Reviewers approve or deny entitlements; "Revoke" decisions automatically trigger the revocation engine.

### 6. Break-Glass Emergency Access (JIT Privileged Access)
- **Capped TTL Enforcement**: Automatically caps emergency access duration to a maximum of 4 hours regardless of requested duration.
- **Dual Authorization**: Enforces Maker-Checker approval and mandatory incident ticket association (`INC-XXXX`).
- **Auto-Revocation**: Automatically revokes elevated access upon TTL expiration.

### 7. Birthright Access Engine & Account Correlation
- **Birthright Engine**: Attribute-based policy evaluation (`department`, `employment_type`) triggering auto-grant workflows during Joiner/Mover events.
- **Account Correlation Engine**: Correlates unlinked target system accounts via exact email matching or routes ambiguous high-risk accounts to a manual review queue.

### 8. Temporal Provenance DAG & Cascade Revocation Engine *(Industry Differentiator)*
- **Credential Lineage DAG**: Native Directed Acyclic Graph tracking `authority_epoch` versions and credential parentage.
- **Real-Time Cascade Revocation**: Instant revocation propagation across AWS IAM, GitHub tokens, SCIM accounts, and active JIT leases upon identity status changes.

### 9. Automated Compliance Report Generator
- **1-Click Audit Packages**: Instant evidence aggregation for **SOX 404**, **SOC 2 Type II**, **ISO/IEC 27001:2022**, and **HIPAA Security Rule**.
- **Multi-Format Export**: Generates structured JSON evidence packages or downloadable CSV audit spreadsheets (`GET /api/v1/compliance-reports/generate`).

### 10. Data Foundation & Schema Extensions
- **Attribute Validation Engine**: Configurable regex matching, enum lists, and length constraints for inbound identity ingestion (`/data-foundation/validation`).
- **Cloud Directories Sync**: Inbound directory synchronization management for Microsoft Entra ID, Okta, and Google Workspace (`/data-foundation/sources/cloud`).
- **Custom Schema Attributes**: Extend identity, account, and entitlement schemas with enterprise custom fields (`/data-foundation/custom`).

### 11. Interactive Visualizers & Developer APIs
- **Identity Lineage Visualizer**: Interactive DAG graph rendering identity state transitions across time epochs (`/governance/identity-lineage`).
- **OpenAPI & Postman Export**: Generate and download Postman 2.1 collection JSON directly from `/api/v1/export-postman`.
- **Real-Time SSE Alert Stream**: Server-Sent Events stream for live governance notifications (`/api/v1/notifications/stream`).

---

## 📊 Market Comparison Matrix

| Feature | SailPoint IdentityNow | Saviynt EIC | Okta IGA | CyberArk PAM | **NextID (rAnalyzer)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **JML Lifecycle Automation** | ✅ | ✅ | ✅ | ⚠️ | **✅ Full (`JMLEngine` + SCIM 2.0)** |
| **Segregation of Duties (SoD)** | ✅ | ✅ | ⚠️ | ❌ | **✅ Full (`SoDEngine` Matrix)** |
| **Multi-Step Approval Workflows** | ✅ | ✅ | ✅ | ⚠️ | **✅ Full (Risk-based Multi-Tier)** |
| **Access Certification Campaigns** | ✅ | ✅ | ✅ | ❌ | **✅ Full (`AccessCertificationEngine`)** |
| **Break-Glass Emergency Access** | ⚠️ Add-on | ✅ | ❌ | ✅ | **✅ Full (4h Capped TTL + Maker-Checker)** |
| **Birthright Auto-Provisioning** | ✅ | ✅ | ✅ | ❌ | **✅ Full (`BirthrightService`)** |
| **Account Correlation Engine** | ✅ | ✅ | ✅ | ❌ | **✅ Full (Exact + Manual Review Queue)** |
| **SCIM 2.0 Inbound/Outbound** | ✅ | ✅ | ✅ | ⚠️ | **✅ Full (`SCIMConnector`)** |
| **Automated Compliance Reports** | ⚠️ Extra Cost | ⚠️ Extra Cost | ⚠️ Basic | ⚠️ Basic | **✅ Built-in (SOX, SOC2, ISO27001, HIPAA)** |
| **Temporal Credential Lineage DAG** | ❌ None | ❌ None | ❌ None | ❌ None | **🚀 UNIQUE ADVANTAGE (`authority_epoch` DAG)** |
| **Deterministic Cascade Revocation** | ⚠️ Eventual | ⚠️ Eventual | ⚠️ Basic | ⚠️ Basic | **🚀 UNIQUE ADVANTAGE (Real-time Cascade)** |

---

## 🛠️ Technology Stack

- **Backend**: Python 3.11 / 3.14, FastAPI, SQLAlchemy ORM, Alembic, PyMySQL, Psycopg2, Cryptography (Fernet)
- **Frontend**: React 18, Vite 8, Vanilla CSS (Design Tokens & Glassmorphism), React Router v6
- **Database & Storage**: PostgreSQL 15 / Supabase, SQLite (Testing)
- **Containerization**: Docker, Docker Compose, Nginx

---

## 🚀 Quickstart & Deployment

### Option 1: Docker Compose (Recommended)

Run the full production stack (Database, Backend API, and Frontend) with a single command:

```bash
docker compose up --build -d
```

Access points:
- **Frontend Web App**: [http://localhost](http://localhost)
- **Backend REST API**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Postman Collection Download**: [http://localhost:8000/api/v1/export-postman](http://localhost:8000/api/v1/export-postman)

### Option 2: Local Development Setup

#### Backend Setup:
```bash
cd backend
python -m venv .venv
# On Windows: .venv\Scripts\activate
# On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup:
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Testing & Verification

Execute the complete 32-test automated backend test suite:

```bash
python -m unittest discover -s backend/tests
```

Execute the frontend production build verification:

```bash
cd frontend
npm run build
```

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.
