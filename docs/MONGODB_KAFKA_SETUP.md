# MongoDB Atlas & Confluent Cloud Kafka Setup Guide

This guide will walk you through setting up MongoDB Atlas (cloud database) and Confluent Cloud (managed Kafka) for the OpenAnalyst API.

---

## Table of Contents

1. [MongoDB Atlas Setup](#mongodb-atlas-setup)
   - [Create Account](#1-create-mongodb-atlas-account)
   - [Create Cluster](#2-create-a-cluster)
   - [Configure Network Access](#3-configure-network-access)
   - [Create Database User](#4-create-database-user)
   - [Get Connection String](#5-get-connection-string)
   - [Test Connection](#6-test-connection)

2. [Confluent Cloud Kafka Setup](#confluent-cloud-kafka-setup)
   - [Create Account](#1-create-confluent-cloud-account)
   - [Create Cluster](#2-create-kafka-cluster)
   - [Create Topics](#3-create-topics)
   - [Create API Keys](#4-create-api-keys)
   - [Get Bootstrap Server](#5-get-bootstrap-server)

3. [Environment Configuration](#environment-configuration)

4. [Verification](#verification)

---

## MongoDB Atlas Setup

MongoDB Atlas is a fully managed cloud database service. We'll use it to store conversations, messages, users, and pending responses.

### 1. Create MongoDB Atlas Account

1. Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)

2. Click **"Try Free"** or **"Start Free"**

3. Sign up options:
   - Sign up with Google
   - Sign up with GitHub
   - Sign up with Email

4. Complete the registration form:
   - First Name
   - Last Name
   - Email
   - Password (if using email)

5. Verify your email if required

6. Answer the onboarding questions (you can skip these):
   - What is your goal today? → "Build a new application"
   - What programming language? → "JavaScript/Node.js"
   - What type of data? → "Application data"

### 2. Create a Cluster

A cluster is where your database lives. The free tier (M0) is sufficient for development.

1. After logging in, you'll see the **"Create a Cluster"** page

2. Choose **"FREE"** tier (M0 Sandbox)
   - 512 MB Storage
   - Shared RAM
   - Perfect for development

3. Select Cloud Provider & Region:
   - **Provider**: AWS (recommended)
   - **Region**: Choose closest to your EC2 instance
     - For India: `ap-south-1` (Mumbai)
     - For EU: `eu-west-1` (Ireland)
     - For US: `us-east-1` (Virginia)

4. Cluster Name:
   - Default is "Cluster0"
   - You can rename it to something like "openanalyst-cluster"

5. Click **"Create Cluster"**

6. Wait 3-5 minutes for cluster provisioning

### 3. Configure Network Access

This allows your EC2 server to connect to MongoDB.

1. In the left sidebar, click **"Network Access"** under SECURITY

2. Click **"+ ADD IP ADDRESS"**

3. You have two options:

   **Option A: Add your EC2 IP (Recommended for production)**
   - Enter your EC2 public IP: `16.171.8.128`
   - Add a comment: "EC2 Production Server"
   - Click "Confirm"

   **Option B: Allow access from anywhere (Development only)**
   - Click "ALLOW ACCESS FROM ANYWHERE"
   - This adds `0.0.0.0/0` which allows all IPs
   - ⚠️ Only use this for testing!

4. If you want to add your local development machine:
   - Click "+ ADD IP ADDRESS" again
   - Click "ADD CURRENT IP ADDRESS"
   - This adds your current computer's IP

### 4. Create Database User

This is the username/password your application uses to connect.

1. In the left sidebar, click **"Database Access"** under SECURITY

2. Click **"+ ADD NEW DATABASE USER"**

3. Authentication Method: **"Password"**

4. Enter credentials:
   - **Username**: `openanalyst_user`
   - **Password**: Click "Autogenerate Secure Password"
   - **IMPORTANT**: Copy and save this password immediately!

   Example password: `xK9mN2pL5qR8sT1v`

5. Database User Privileges:
   - Select **"Read and write to any database"**
   - This is under "Built-in Role"

6. Click **"Add User"**

### 5. Get Connection String

This is the URL your application uses to connect to MongoDB.

1. In the left sidebar, click **"Database"** under DEPLOYMENT

2. Find your cluster and click **"Connect"**

3. Choose **"Connect your application"**

4. Select:
   - Driver: **Node.js**
   - Version: **5.5 or later**

5. Copy the connection string. It looks like:
   ```
   mongodb+srv://openanalyst_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

6. Replace `<password>` with your actual password:
   ```
   mongodb+srv://openanalyst_user:xK9mN2pL5qR8sT1v@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

7. Add your database name before the `?`:
   ```
   mongodb+srv://openanalyst_user:xK9mN2pL5qR8sT1v@cluster0.xxxxx.mongodb.net/openanalyst?retryWrites=true&w=majority
   ```

### 6. Test Connection

Test your connection string locally before deploying:

```javascript
// test-mongo.js
const mongoose = require('mongoose');

const uri = 'mongodb+srv://openanalyst_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/openanalyst?retryWrites=true&w=majority';

mongoose.connect(uri)
  .then(() => {
    console.log('✅ MongoDB connected successfully!');
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
  });
```

Run it:
```bash
node test-mongo.js
```

---

## Confluent Cloud Kafka Setup

Confluent Cloud is a fully managed Kafka service. We'll use it for message queuing to handle high loads and offline response delivery.

### 1. Create Confluent Cloud Account

1. Go to [https://confluent.cloud](https://confluent.cloud)

2. Click **"Try Free"** or **"Get Started Free"**

3. Sign up options:
   - Sign up with Google
   - Sign up with GitHub
   - Sign up with Email

4. Complete registration:
   - First Name
   - Last Name
   - Email
   - Password
   - Company (optional)

5. Verify your email

6. You get **$400 free credits** for 30 days

### 2. Create Kafka Cluster

1. After logging in, click **"Add cluster"** or you'll be prompted to create one

2. Choose Cluster Type:
   - **Basic**: $0.00/hour (Free tier available)
   - Select **"Basic"** for development

3. Select Cloud Provider & Region:
   - **Provider**: AWS
   - **Region**: Same as your EC2/MongoDB
     - For India: `ap-south-1` (Mumbai)
     - For EU: `eu-west-1` (Ireland)
     - For US: `us-east-1` (Virginia)

4. Cluster Name:
   - Enter: `openanalyst-kafka`

5. Click **"Launch cluster"**

6. Wait 2-3 minutes for provisioning

### 3. Create Topics

Topics are channels where messages are published and consumed.

1. Click on your cluster name to open it

2. In the left sidebar, click **"Topics"**

3. Click **"+ Add topic"**

4. Create first topic (for requests):
   - **Topic name**: `agent-requests`
   - **Partitions**: 6 (for parallelism)
   - Click "Create with defaults"

5. Create second topic (for responses):
   - Click **"+ Add topic"** again
   - **Topic name**: `agent-responses`
   - **Partitions**: 6
   - Click "Create with defaults"

### 4. Create API Keys

API keys are credentials your application uses to connect.

1. In the left sidebar, click **"API keys"** (under Cluster Overview)

2. Click **"+ Add key"**

3. Select scope:
   - Choose **"Global access"** for simplicity
   - Or "Granular access" for production security

4. Click **"Next"**

5. Your API key is generated:
   ```
   API Key:    ABCD1234EFGH5678
   API Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

6. **IMPORTANT**:
   - Click **"Download and continue"** or **"Copy"**
   - Save both the Key and Secret immediately
   - You cannot view the Secret again after this page!

### 5. Get Bootstrap Server

The bootstrap server is the connection URL for Kafka.

1. In your cluster, click **"Cluster settings"** in the left sidebar

2. Look for **"Bootstrap server"**

3. It looks like:
   ```
   pkc-xxxxx.ap-south-1.aws.confluent.cloud:9092
   ```

4. Copy this URL

---

## Environment Configuration

Now update your `.env` file with the credentials:

### On your local machine (for testing):

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
# ============================================
# MONGODB CONFIGURATION
# ============================================
MONGODB_URI=mongodb+srv://openanalyst_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/openanalyst?retryWrites=true&w=majority

# ============================================
# KAFKA / CONFLUENT CLOUD CONFIGURATION
# ============================================
KAFKA_BOOTSTRAP_SERVERS=pkc-xxxxx.ap-south-1.aws.confluent.cloud:9092
KAFKA_API_KEY=ABCD1234EFGH5678
KAFKA_API_SECRET=your-api-secret-here
KAFKA_REQUEST_TOPIC=agent-requests
KAFKA_RESPONSE_TOPIC=agent-responses
KAFKA_CONSUMER_GROUP=openanalyst-workers
KAFKA_CLIENT_ID=openanalyst-api
KAFKA_USE_SSL=true
```

### On EC2 Server:

```bash
ssh -i claude-code.pem ubuntu@16.171.8.128
cd /home/ubuntu/Claude-Code/backend
nano .env
```

Add the same configuration, then save and exit (`Ctrl+X`, `Y`, `Enter`).

---

## Verification

### Verify MongoDB Connection

```bash
# On EC2 or locally
cd backend
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'your-connection-string')
  .then(() => { console.log('✅ MongoDB OK'); process.exit(0); })
  .catch(e => { console.log('❌ MongoDB Failed:', e.message); process.exit(1); });
"
```

### Verify Kafka Connection

```bash
# On EC2 or locally
cd backend
node -e "
const { Kafka } = require('kafkajs');
const kafka = new Kafka({
  clientId: 'test',
  brokers: [process.env.KAFKA_BOOTSTRAP_SERVERS || 'your-bootstrap-server'],
  ssl: true,
  sasl: {
    mechanism: 'plain',
    username: process.env.KAFKA_API_KEY || 'your-api-key',
    password: process.env.KAFKA_API_SECRET || 'your-api-secret',
  },
});
const admin = kafka.admin();
admin.connect()
  .then(() => admin.listTopics())
  .then(topics => { console.log('✅ Kafka OK. Topics:', topics); process.exit(0); })
  .catch(e => { console.log('❌ Kafka Failed:', e.message); process.exit(1); });
"
```

### Start the API

```bash
cd backend
npm install
npm run build
npm start
```

Check health:
```bash
curl http://localhost:3456/health
```

Expected response:
```json
{
  "status": "ok",
  "database": {
    "type": "mongodb",
    "connected": true
  },
  "kafka": {
    "configured": true,
    "producer": "connected",
    "consumer": "running"
  }
}
```

---

## Troubleshooting

### MongoDB Issues

**Error: "MongoNetworkError: connection timed out"**
- Your IP is not in the Network Access whitelist
- Go to MongoDB Atlas → Network Access → Add your IP

**Error: "Authentication failed"**
- Wrong username or password
- Check Database Access in MongoDB Atlas
- Make sure password doesn't have special characters like `@` (URL encode them)

**Error: "Invalid connection string"**
- Make sure the format is correct
- Database name should be after `.mongodb.net/` and before `?`

### Kafka Issues

**Error: "SASL Authentication failed"**
- Wrong API Key or Secret
- Create a new API key in Confluent Cloud

**Error: "Unknown topic or partition"**
- Topics don't exist
- Create `agent-requests` and `agent-responses` topics

**Error: "Broker not available"**
- Wrong bootstrap server URL
- Check Cluster Settings in Confluent Cloud

### General Tips

1. **Always test connections locally first** before deploying to EC2

2. **Keep credentials secure**:
   - Never commit `.env` to git
   - Use different credentials for dev/production

3. **Monitor usage**:
   - MongoDB Atlas: Check Data Size in cluster dashboard
   - Confluent Cloud: Check Throughput in cluster dashboard

4. **Free tier limits**:
   - MongoDB M0: 512MB storage, 100 connections
   - Confluent Basic: Limited throughput, but enough for development

---

## Quick Reference

### MongoDB Atlas URLs
- Dashboard: https://cloud.mongodb.com
- Documentation: https://docs.atlas.mongodb.com

### Confluent Cloud URLs
- Dashboard: https://confluent.cloud
- Documentation: https://docs.confluent.io/cloud

### Your Configuration Summary

| Service | Value |
|---------|-------|
| MongoDB URI | `mongodb+srv://...` |
| Kafka Bootstrap | `pkc-xxxxx.xxx.aws.confluent.cloud:9092` |
| Kafka Topics | `agent-requests`, `agent-responses` |
| API Port | `3456` |

---

## Next Steps After Setup

1. Update `.env` on EC2 with your credentials
2. Run `npm install` to install new dependencies
3. Run `npm run build` to compile TypeScript
4. Restart the API with `pm2 restart openanalyst-api`
5. Test endpoints using the health check

```bash
# On EC2
cd /home/ubuntu/Claude-Code
git pull
cd backend
npm install
npm run build
pm2 restart openanalyst-api
curl http://localhost:3456/health
```
