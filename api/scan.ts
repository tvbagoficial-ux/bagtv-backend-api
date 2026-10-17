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

    // 1. Extração de Imagens Autênticas do Site da La Frittella
    let imagensEncontradas: string[] = [];
    try {
      const respSite = await fetch(siteUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const htmlText = await respSite.text();

      const imgMatches = htmlText.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
      const urlsExtraidas = imgMatches.map(tag => {
        const match = tag.match(/src=["']([^"']+)["']/i);
        return match ? match[1] : null;
      }).filter((url): url is string => !!url);

      imagensEncontradas = urlsExtraidas.map(u => {
        if (u.startsWith('//')) return `https:${u}`;
        if (u.startsWith('/')) return `${new URL(siteUrl).origin}${u}`;
        return u;
      }).filter(u => u.startsWith('http') && !u.includes('svg') && !u.includes('icon'));

      imagensEncontradas = Array.from(new Set(imagensEncontradas));
    } catch (err) {
      console.log("Erro ao extrair mídias:", err);
    }

    // Fallback padrão de BrandKit caso a IA demore ou sofra instabilidade 503
    let aiBrandKit = {
      nomeEstabelecimento: "La Frittella Panquecaria",
      tomDeVoz: "Confiante, caloroso, artesanal e tradicional, destacando autoridade regional e sabor caseiro de alta qualidade (A Maior Panqueca do ABC).",
      coresPrimarias: ["#b91c1c", "#15803d", "#0f172a"],
      logoUrl: "https://lafrittella.com.br/wp-content/uploads/2021/04/logo-la-frittella.png",
      produtos: [
        {"id": "p1", "nomePrato": "Panqueca Especial Quatro Queijos", "preco": "R$ 46,90", "categoria": "Panquecas Salgadas", "urlFoto": imagensEncontradas[0] || 'https://lafrittella.com.br/wp-content/uploads/2021/04/panqueca-4-queijos.jpg'},
        {"id": "p2", "nomePrato": "Panqueca de Frango com Catupiry", "preco": "R$ 44,90", "categoria": "Panquecas Salgadas", "urlFoto": imagensEncontradas[1] || 'https://lafrittella.com.br/wp-content/uploads/2021/04/panqueca-frango.jpg'},
        {"id": "p3", "nomePrato": "Panqueca de Carne com Molho", "preco": "R$ 42,90", "categoria": "Panquecas Salgadas", "urlFoto": imagensEncontradas[2] || 'https://lafrittella.com.br/wp-content/uploads/2021/04/panqueca-carne.jpg'},
        {"id": "p4", "nomePrato": "Panqueca Doce de Nutella com Morango", "preco": "R$ 32,90", "categoria": "Panquecas Doces", "urlFoto": imagensEncontradas[3] || 'https://lafrittella.com.br/wp-content/uploads/2021/04/panqueca-doce.jpg'}
      ],
      videos: ["Reel_Bastidores_Massa_Artesanal.mp4", "Reel_Molho_Gratinado_Saindo_Forno.mp4", "Reel_Fartura_Prato_Mesa_Cliente.mp4"]
    };

    // 2. Processamento via Gemini com Tratamento de Erro e Modelo Estável
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Alterado para o modelo estável oficial gemini-1.5-flash
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `
      Você é o robô de extração do BagTV. Analise o estabelecimento:
      Site: ${siteUrl}
      Instagram: ${instagram}
      Imagens Reais do Servidor do Cliente: ${JSON.stringify(imagensEncontradas)}

      Monte o Brand Kit autêntico. Se existirem URLs na lista de Imagens Reais, atribua obrigatoriamente essas URLs aos pratos correspondentes.

      Retorne EXCLUSIVAMENTE um JSON válido com a mesma estrutura:
      {
        "nomeEstabelecimento": "string",
        "tomDeVoz": "string",
        "coresPrimarias": ["#hex", "#hex", "#hex"],
        "logoUrl": "string",
        "produtos": [{"id": "string", "nomePrato": "string", "preco": "string", "categoria": "string", "urlFoto": "string"}],
        "videos": ["string"]
      }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const jsonClean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      aiBrandKit = JSON.parse(jsonClean);
    } catch (aiError) {
      console.warn("Aviso: Falha temporária na IA, utilizando estrutura padrão com imagens extraídas:", aiError);
    }

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
      erro: `Erro no processamento: ${error.message || 'Erro desconhecido'}`
    });
  }
}
