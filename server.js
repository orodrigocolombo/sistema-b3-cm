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
  // Cert/Key do pacote (base64) já salvos no Railway
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

/**
 * ✅ GUIA (como já fizemos)
 * GET /api/b3/guia?product=AssetsTrading&referenceStartDate=2026-02-01&referenceEndDate=2026-02-10&page=1
 */
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

/**
 * ✅ AUTOSSERVIÇO (GERAR NOVO PACOTE/CERTIFICADO)
 * POST /api/b3/autosservico
 * body JSON:
 * {
 *   "nome": "Rodrigo Colombo",
 *   "documento": "34859712000182",
 *   "email": "contato@rodrigocolombo.com.br"
 * }
 */
app.post("/api/b3/autosservico", async (req, res) => {
  try {
    const nome = req.body?.nome;
    const documento = req.body?.documento;
    const email = req.body?.email;

    if (!nome || !documento || !email) {
      return res.status(400).json({
        success: false,
        detail: "Campos obrigatórios no body: nome, documento (CNPJ só números), email.",
      });
    }

    const httpsAgent = createHttpsAgent();

    // Host CERT + basepath /api/acesso + endpoint /autosservico
    const url = `https://apib3i-cert.b3.com.br:2443/api/acesso/autosservico`;

    const form = new URLSearchParams({
      nome,
      documento,
      email,
    });

    const resp = await axios.post(url, form, {
      httpsAgent,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30000,
      validateStatus: () => true, // pra devolver o status real da B3 mesmo se vier 4xx/5xx
    });

    return res.status(resp.status).json({
      success: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      detail: resp.data,
    });
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
