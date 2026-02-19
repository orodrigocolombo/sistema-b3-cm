import express from "express";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Faltando variável ${name}.`);
  return v;
}

function createHttpsAgent() {
  const certB64 = getRequiredEnv("B3_CERT_BASE64").replace(/\s+/g, "");
  const keyB64 = getRequiredEnv("B3_KEY_BASE64").replace(/\s+/g, "");

  const cert = Buffer.from(certB64, "base64");
  const key = Buffer.from(keyB64, "base64");

  return new https.Agent({
    cert,
    key,
    rejectUnauthorized: false,
  });
}

async function getAccessToken() {
  const tokenUrl = getRequiredEnv("B3_TOKEN_URL");
  const clientId = getRequiredEnv("B3_CLIENT_ID");
  const clientSecret = getRequiredEnv("B3_CLIENT_SECRET");
  const scope = getRequiredEnv("B3_SCOPE");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: scope,
  });

  const resp = await axios.post(tokenUrl, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000,
  });

  if (!resp.data?.access_token) throw new Error("Token não retornou access_token.");
  return resp.data.access_token;
}

app.get("/health", (req, res) => res.json({ ok: true }));

// ✅ GUIA - conforme Swagger: /api/updated-product/v1/investors
app.get("/api/b3/guia", async (req, res) => {
  try {
    const baseUrl = getRequiredEnv("B3_BASE_URL");
    const product = req.query.product;
    const referenceStartDate = req.query.referenceStartDate;
    const referenceEndDate = req.query.referenceEndDate;
    const page = req.query.page;

    if (!product || !referenceStartDate) {
      return res.status(400).json({
        success: false,
        detail: "Parâmetros obrigatórios: product e referenceStartDate (YYYY-MM-DD).",
      });
    }

    const token = await getAccessToken();
    const httpsAgent = createHttpsAgent();

    const url = `${baseUrl}/api/updated-product/v1/investors`;

    const resp = await axios.get(url, {
      httpsAgent,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      params: {
        product,
        referenceStartDate,
        ...(referenceEndDate ? { referenceEndDate } : {}),
        ...(page ? { page } : {}),
      },
      timeout: 30000,
    });

    res.json({ success: true, data: resp.data });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: err?.response?.status,
      detail: err?.response?.data || err?.message || String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
