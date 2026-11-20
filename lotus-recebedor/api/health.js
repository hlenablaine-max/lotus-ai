// Para conferir se o recebedor está no ar
export default function handler(_req, res) {
  res.status(200).json({ ok: true, servico: 'recebedor da LOTUS' })
}
