import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configuração de cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const instagram = body?.instagram || "@lafrittella.panquecaria";
    const siteUrl = body?.siteUrl || "https://lafrittella.com.br";
    const cardapioUrl = body?.cardapioUrl || "";

    // 1. Raspagem HTML básica de imagens do site
    let extraidedImages: string[] = [];
    let pageTitle = "";
    let pageDescription = "";

    try {
      const responseHtml = await fetch(siteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const htmlText = await responseHtml.text();
      const $ = cheerio.load(htmlText);

      pageTitle = $('title').text().trim();
      pageDescription = $('meta[name="description"]').attr('content') || '';

      $('img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && (src.startsWith('http') || src.startsWith('//'))) {
          extraidedImages.push(src.startsWith('//') ? `https:${src}` : src);
        }
      });
      extraidedImages = Array.from(new Set(extraidedImages)).slice(0, 12);
    } catch (e) {
      console.log("Aviso: Não foi possível raspar o site diretamente", e);
    }

    // 2. Análise com Gemini 1.5 Flash usando a chave guardada nas variáveis da Vercel
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `
      Você é o motor de IA do BagTV. Analise as mídias do estabelecimento e monte o Brand Kit em formato JSON limpo.
      
      Site: ${siteUrl}
      Instagram: ${instagram}
      Cardápio URL: ${cardapioUrl}
      Título: ${pageTitle}
      Descrição: ${pageDescription}
      Imagens Encontradas no Site: ${JSON.stringify(extraidedImages)}

      Retorne EXCLUSIVAMENTE um JSON válido com esta estrutura:
      {
        "nomeEstabelecimento": "La Frittella Panquecaria",
        "tomDeVoz": "Familiar, acolhedor e focado em fartura (A Maior do ABC).",
        "coresPrimarias": ["#b91c1c", "#15803d", "#ffffff"],
        "logoUrl": "${extraidedImages[0] || 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=200&q=80'}",
        "produtos": [
          {"id": "p1", "nomePrato": "Combo Família III", "preco": "R$ 185,90", "categoria": "Combos", "urlFoto": "${extraidedImages[1] || 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=600&q=80'}"},
          {"id": "p2", "nomePrato": "Panqueca La Monstra", "preco": "R$ 69,90", "categoria": "Autorais", "urlFoto": "${extraidedImages[2] || 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=80'}"}
        ],
        "videos": ["Reel_Bastidores_Extraido.mp4"]
      }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const jsonClean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const aiBrandKit = JSON.parse(jsonClean);

      return res.status(200).json({
        sucesso: true,
        brandKit: {
          ...aiBrandKit,
          instagram,
          siteUrl,
          cardapioUrl
        }
      });
    }

    return res.status(500).json({ sucesso: false, erro: 'Chave GEMINI_API_KEY não encontrada nas variáveis da Vercel' });

  } catch (error: any) {
    return res.status(500).json({ sucesso: false, erro: error.message || 'Erro de processamento' });
  }
}
