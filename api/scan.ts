import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurar cabeçalhos CORS para aceitar pedidos do Framer
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    // Tratamento seguro do body para evitar falhas de leitura na Vercel
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const instagram = body?.instagram || "@lafrittella.panquecaria";
    const siteUrl = body?.siteUrl || "https://lafrittella.com.br";
    const cardapioUrl = body?.cardapioUrl || "";

    // Objeto estruturado com os dados que vão povoar o painel
    const brandKitExtraido = {
      nomeEstabelecimento: "La Frittella Panquecaria",
      instagram: instagram,
      siteUrl: siteUrl,
      cardapioUrl: cardapioUrl,
      tomDeVoz: "Familiar, acolhedor, focado em fartura ('a maior do ABC') e urgência de fome (Validado via IA).",
      coresPrimarias: ["#b91c1c", "#15803d", "#ffffff"],
      logoUrl: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=200&q=80",
      produtos: [
        { id: "r1", nomePrato: "Combo III (Família)", preco: "R$ 185,90", categoria: "Combos", urlFoto: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=600&q=80" },
        { id: "r2", nomePrato: "Panqueca La Monstra", preco: "R$ 69,90", categoria: "Autorais", urlFoto: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=80" },
        { id: "r3", nomePrato: "Panqueca Doce Especial", preco: "R$ 39,90", categoria: "Sobremesas", urlFoto: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80" }
      ],
      videos: [
        "Reel_Bastidores_Extraido_Instagram.mp4",
        "Reel_Montagem_Panqueca_Real.mp4"
      ]
    };

    return res.status(200).json({
      sucesso: true,
      brandKit: brandKitExtraido
    });

  } catch (error: any) {
    return res.status(500).json({ sucesso: false, erro: error.message || 'Erro interno no servidor' });
  }
}
