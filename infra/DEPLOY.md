# Deploying Nigrani to AWS

Backend → **App Runner** (source-based, deploys straight from GitHub via `apprunner.yaml`, no local Docker build/ECR push needed). Frontend → **Amplify Hosting** (static Vite build, also source-based from GitHub). Data → real **DynamoDB** + **S3**. Vision → **Bedrock**.

Prerequisites: `aws configure` with credentials that can create DynamoDB tables, an S3 bucket, an App Runner service + its IAM role, and an Amplify app (broad/admin access on a sandbox account is simplest). Region used below: `ap-south-1` (Mumbai, closest to Delhi-NCR) — change everywhere if you'd rather use something else.

## 1. DynamoDB tables + S3 bucket

```bash
AWS_REGION=ap-south-1 python scripts/setup_dynamodb.py   # uses real AWS when AWS_ENDPOINT_URL is unset
aws s3 mb s3://nigrani-photos-prod --region ap-south-1
```

## 2. Bedrock model access (console, do this first — approval can take a few minutes)

AWS Console → Bedrock → Model access → request access to a Claude model (e.g. Claude 3.5 Sonnet). Note the model ID once granted, it goes into `apprunner.yaml`'s `BEDROCK_MODEL_ID`. Not every model is available in every region — if Claude isn't offered in `ap-south-1` when you check, either switch Bedrock calls to `us-east-1` (`AWS_REGION` is read independently per AWS SDK call, so the rest of the stack can stay in `ap-south-1`) or move everything to `us-east-1`.

## 3. App Runner (backend)

Connect App Runner to this GitHub repo once (console: App Runner → Create service → Source code repository → connect GitHub → select `aryank2212/nigrani`, branch `main`). It auto-detects `apprunner.yaml` at the repo root.

The service needs an **instance role** so the running app can call DynamoDB/S3/Bedrock without any secret keys (App Runner injects temporary credentials automatically):

```bash
aws iam create-role --role-name nigrani-apprunner-instance \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": {"Service": "tasks.apprunner.amazonaws.com"}, "Action": "sts:AssumeRole"}]
  }'
aws iam put-role-policy --role-name nigrani-apprunner-instance \
  --policy-name nigrani-data-access \
  --policy-document file://infra/apprunner-instance-role-policy.json
```

Attach that role as the service's **instance role** (not the source-access role, which is separate and only needs GitHub read access) when creating the service, either in the console or via `aws apprunner create-service` with `--instance-configuration InstanceRoleArn=...`.

Once deployed, note the service URL (`https://<id>.ap-south-1.awsapprunner.com`) — the frontend needs it next.

## 4. Amplify Hosting (frontend)

```bash
aws amplify create-app --name nigrani --repository https://github.com/aryank2212/nigrani \
  --region ap-south-1 --platform WEB
# then, in the console: connect the GitHub branch (main), set appRoot to "frontend"
# (already configured via frontend/amplify.yml) and add this environment variable:
#   VITE_BACKEND_URL = https://<the App Runner URL from step 3>
```

Vite inlines env vars at build time, so `VITE_BACKEND_URL` has to be set in Amplify's build environment *before* the first build, not just at runtime.

## 5. Seed data (optional, for a populated demo)

```bash
AWS_REGION=ap-south-1 python scripts/seed_data.py
```

## Verifying it worked

```bash
curl https://<app-runner-url>/api/health
curl https://<app-runner-url>/api/complaints | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
```

Then open the Amplify URL and submit a real report with a real photo — it should get a real DynamoDB incident id back (visible in the browser's network tab, or via `GET /api/complaints`).
