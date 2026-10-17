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

    // 1. Raspagem simples para buscar imagens reais do site
    let imagensEncontradas: string[] = [];
    let textoPagina = "";

    try {
      const respSite = await fetch(siteUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const htmlText = await respSite.text();

      // Extrair tags <img> do HTML do site
      const imgMatches = htmlText.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
      const urlsExtraidas = imgMatches.map(tag => {
        const match = tag.match(/src=["']([^"']+)["']/i);
        return match ? match[1] : null;
      }).filter((url): url is string => !!url);

      // Normalizar URLs relativas
      const urlsCompletas = urlsExtraidas.map(u => {
        if (u.startsWith('//')) return `https:${u}`;
        if (u.startsWith('/')) return `${new URL(siteUrl).origin}${u}`;
        return u;
      }).filter(u => u.startsWith('http') && !u.includes('svg') && !u.includes('icon'));

      imagensEncontradas = Array.from(new Set(urlsCompletas)).slice(0, 15);
      
      // Limpar texto básico do HTML
      textoPagina = htmlText.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
                             .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
                             .replace(/<[^>]+>/g, ' ')
                             .replace(/\s+/g, ' ')
                             .substring(0, 3000);
    } catch (errScrape) {
      console.log("Aviso de raspagem:", errScrape);
    }

    // 2. Passar os dados extraídos para o Gemini estruturar
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

    const prompt = `
    Você é o robô de extração de marca do BagTV. Analise o conteúdo extraído do site de um estabelecimento e estruture o Brand Kit.

    Site Oficial: ${siteUrl}
    Instagram: ${instagram}
    Cardápio URL: ${cardapioUrl}
    Imagens Reais Encontradas no Site: ${JSON.stringify(imagensEncontradas)}
    Trecho de Texto Encontrado no Site: "${textoPagina}"

    INSTRUÇÕES CRÍTICAS:
    - Identifique qual das URLs de imagem parece ser o logotipo oficial ou a fachada.
    - Se houver imagens de pratos na lista de imagens encontradas, atribua-as aos produtos.
    - Se a lista de imagens encontradas contiver URLs válidas, USE PREFERENCIALMENTE ESSAS URLs no campo logoUrl e urlFoto.
    - Se não houver imagens suficientes, use imagens genéricas de alta qualidade adequadas ao tipo de comida (panquecas/massas).

    Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown), com esta estrutura exata:
    {
      "nomeEstabelecimento": "Nome real do local",
      "tomDeVoz": "Resumo do tom de voz extraído do texto",
      "coresPrimarias": ["#hex1", "#hex2", "#hex3"],
      "logoUrl": "URL do logo ou da imagem principal extraída",
      "produtos": [
        {"id": "p1", "nomePrato": "Nome do Prato", "preco": "R$ XX,XX", "categoria": "Categoria", "urlFoto": "URL da foto extraída"}
      ],
      "videos": ["Reel_01.mp4", "Reel_02.mp4"]
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
      erro: `Erro no processamento: ${error.message || 'Erro desconhecido'}`
    });
  }
}
