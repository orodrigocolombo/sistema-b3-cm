import express from "express";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/**
 * ✅ mTLS: cria o agente HTTPS usando o P12 vindo de Base64 (Railway Variables)
 * Vars necessárias:
 * - B3_P12_BASE64
 * - B3_P12_PASSWORD
 */
function createHttpsAgent() {
  if (!process.env.B3_P12_BASE64) {
    throw new Error("Faltando variável B3_P12_BASE64 (certificado .p12 em base64).");
  }
  if (!process.env.B3_P12_PASSWORD) {
    throw new Error("Faltando variável B3_P12_PASSWORD (senha do .p12).");
  }

  const p12Buffer = Buffer.from(process.env.B3_P12_BASE64, "base64");

  return new https.Agent({
    pfx: p12Buffer,
    passphrase: process.env.B3_P12_PASSWORD,
    // Em homologação pode ser necessário; em produção o ideal é true (validar CA corretamente).
    rejectUnauthorized: false,
  });
}

const httpsAgent = createHttpsAgent();

/**
 * ✅ OAuth2: pega token no Microsoft (Azure AD) usando client_credentials + scope
 * Vars necessárias:
 * - B3_TOKEN_URL  (ex: https://login.microsoftonline.com/.../oauth2/v2.0/token)
 * - B3_CLIENT_ID
 * - B3_CLIENT_SECRET
 * - B3_SCOPE      (ex: 0c991613-4c90-454d-8685-d466a47669cb%2F.default)
 */
async function getAccessToken() {
  const { B3_TOKEN_URL, B3_CLIENT_ID, B3_CLIENT_SECRET, B3_SCOPE } = process.env;

  if (!B3_TOKEN_URL) throw new Error("Faltando variável B3_TOKEN_URL.");
  if (!B3_CLIENT_ID) throw new Error("Faltando variável B3_CLIENT_ID.");
  if (!B3_CLIENT_SECRET) throw new Error("Faltando variável B3_CLIENT_SECRET.");
  if (!B3_SCOPE) throw new Error("Faltando variável B3_SCOPE.");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: B3_CLIENT_ID,
    client_secret: B3_CLIENT_SECRET,
    scope: B3_SCOPE,
  });

  const resp = await axios.post(B3_TOKEN_URL, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    // O token é no Microsoft, mas manter o agent não prejudica; pode remover se quiser.
    httpsAgent,
    timeout: 30000,
  });

  if (!resp.data?.access_token) {
    throw new Error("Token não retornou access_token. Verifique client_id/secret/scope.");
  }

  return resp.data.access_token;
}

/**
 * ✅ Healthcheck B3 (CERT)
 * Var necessária:
 * - B3_BASE_URL  (ex: https://apib3i-cert.b3.com.br:2443)
 */
app.get("/api/b3/test", async (req, res) => {
  try {
    if (!process.env.B3_BASE_URL) {
      throw new Error("Faltando variável B3_BASE_URL.");
    }

    const token = await getAccessToken();

    const health = await axios.get(`${process.env.B3_BASE_URL}/api/acesso/healthcheck`, {
      httpsAgent,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    res.json({
      success: true,
      message: "Token OK + mTLS OK (healthcheck passou)",
      healthcheck: health.data,
    });
  } catch (err) {
    const status = err?.response?.status;
    const detail = err?.response?.data || err?.message || String(err);

    res.status(500).json({
      success: false,
      message: "Falhou token e/ou mTLS",
      status,
      detail,
    });
  }
});

/**
 * Endpoint simples pra ver se o backend está no ar
 */
app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

