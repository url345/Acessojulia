// Vercel Serverless Function: cria a cobrança PIX na Nova Pay.
// Variáveis de ambiente (Vercel > Settings > Environment Variables):
//   NOVAPAY_CI = seu client id     NOVAPAY_CS = seu client secret
const API = "https://api.anovapay.com.br/charges";

// Os preços ficam aqui no servidor, para ninguém alterar o valor pelo navegador.
const PRODUCTS = {
  vip:  { amount: 13.9, description: "ACESSO VIP" },
  call: { amount: 50.0, description: "VIDEOCHAMADA 30 min" },
};

// Procura na resposta o código PIX copia e cola (começa com 000201) e a imagem do QR.
function scan(obj, out = {}) {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        if (!out.pix && v.startsWith("000201")) out.pix = v;
        const key = k.toLowerCase().replace(/[_-]/g, "");
        if (!out.qrImage && /qrcode(image|base64)|qrimage/.test(key)) {
          out.qrImage = /^(https?:|data:)/.test(v) ? v : "data:image/png;base64," + v;
        }
        if (!out.id && /^(id|transactionid|txid)$/.test(key)) out.id = v;
      } else scan(v, out);
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { NOVAPAY_CI, NOVAPAY_CS } = process.env;
  if (!NOVAPAY_CI || !NOVAPAY_CS) return res.status(500).json({ error: "Credenciais não configuradas" });

  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const product = PRODUCTS[body.product];
  if (!product) return res.status(400).json({ error: "Produto inválido" });

  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ci: NOVAPAY_CI, cs: NOVAPAY_CS },
      body: JSON.stringify({ amount: product.amount, description: product.description }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "Falha ao criar a cobrança", status: r.status });

    const found = scan(data);
    if (!found.pix) return res.status(502).json({ error: "Resposta sem código PIX", raw: data });
    return res.status(200).json(found);
  } catch (e) {
    return res.status(502).json({ error: "Erro ao falar com a Nova Pay" });
  }
}
