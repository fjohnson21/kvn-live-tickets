services:
  - type: web
    name: kvn-live-tickets-v3-test
    runtime: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /
    envVars:
      - key: NODE_VERSION
        value: 20.19.0
      - key: PLATFORM_FEE_PERCENT
        value: 5
      - key: DATA_DIR
        value: /var/data
      - key: UPLOAD_DIR
        value: /var/data/uploads
      - key: STRIPE_SECRET_KEY
        sync: false
      - key: STRIPE_WEBHOOK_SECRET
        sync: false
      - key: BASE_URL
        sync: false
      - key: OWNER_EMAIL
        sync: false
      - key: RESEND_API_KEY
        sync: false
      - key: EMAIL_FROM
        sync: false
    disk:
      name: kvn-live-tickets-data
      mountPath: /var/data
      sizeGB: 1
