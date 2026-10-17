import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

    const instagram = body?.instagram || "@lafrittellapanquecaria";
    const siteUrl = body?.siteUrl || "https://lafrittella.com.br";
    const cardapioUrl = body?.cardapioUrl || "";

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        sucesso: false,
        erro: "Chave GEMINI_API_KEY não foi encontrada nas variáveis de ambiente da Vercel."
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Tenta usar o modelo atual da SDK e faz fallback automático se necessário
    let model;
    try {
      model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    } catch (e) {
      model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    }

    const prompt = `
    Você é o assistente de IA do BagTV. Monte o Brand Kit em formato JSON para o estabelecimento:
    Site: ${siteUrl}
    Instagram: ${instagram}
    Cardápio: ${cardapioUrl}

    Retorne EXCLUSIVAMENTE um objeto JSON válido (sem textos explicativos ou blocos markdown), exatamente com esta estrutura:
    {
      "nomeEstabelecimento": "La Frittella Panquecaria",
      "tomDeVoz": "Familiar, acolhedor e focado em fartura ('A Maior Panqueca do ABC').",
      "coresPrimarias": ["#b91c1c", "#15803d", "#ffffff"],
      "logoUrl": "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=200&q=80",
      "produtos": [
        {"id": "p1", "nomePrato": "Combo III (Família)", "preco": "R$ 185,90", "categoria": "Combos", "urlFoto": "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=600&q=80"},
        {"id": "p2", "nomePrato": "Panqueca La Monstra", "preco": "R$ 69,90", "categoria": "Autorais", "urlFoto": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=80"},
        {"id": "p3", "nomePrato": "Panqueca Doce de Morango", "preco": "R$ 39,90", "categoria": "Sobremesas", "urlFoto": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80"}
      ],
      "videos": ["Reel_Bastidores_Extraido_Instagram.mp4", "Reel_Montagem_Panqueca_Real.mp4"]
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

  } catch (error: any) {
    return res.status(200).json({
      sucesso: false,
      erro: `Erro na execução do Gemini: ${error.message || 'Erro desconhecido'}`
    });
  }
}
