import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const instagramRaw = body?.instagram || "@lafrittellapanquecaria";
    const instagramHandle = instagramRaw.replace("@", "").trim();

    const apifyToken = process.env.APIFY_API_TOKEN;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apifyToken) {
      return res.status(200).json({ sucesso: false, erro: "APIFY_API_TOKEN não configurada na Vercel." });
    }

    // 1. Extração no Apify
    const actorId = "apify~instagram-scraper";
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const responseApify = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${instagramHandle}/`],
        resultsLimit: 12,
        resultsType: "posts"
      })
    });

    if (!responseApify.ok) {
      throw new Error(`Falha na API do Apify: HTTP status ${responseApify.status}`);
    }

    const itemsApify = await responseApify.json();

    if (!Array.isArray(itemsApify) || itemsApify.length === 0) {
      return res.status(200).json({ sucesso: false, erro: "Nenhum post público encontrado para este perfil." });
    }

    // Formatação dos posts
    const postsCarregados = itemsApify.map((item: any, index: number) => ({
      id: item.id || `post-${index}`,
      nomePrato: item.caption || "Publicação do Instagram",
      preco: "Post Instagram",
      categoria: item.type === "Video" ? "Reels / Vídeo" : "Foto Feed",
      urlFoto: item.displayUrl || item.url || (item.images && item.images[0]),
      likesCount: item.likesCount || 0,
      commentsCount: item.commentsCount || 0,
      timestamp: item.timestamp ? new Date(item.timestamp).toLocaleDateString("pt-BR") : "Recente"
    })).filter(post => !!post.urlFoto);

    // 2. Análise Dinâmica via Gemini IA
    let diagnosticoDinamico = {
      pilar1_iluminacao: "Fotos estáticas com iluminação amarela/sombra sem foco nos detalhes e brilho dos ingredientes.",
      pilar2_movimento: "Falta de vídeos dinâmicos (Reels) mostrando preparação, textura e movimento para reter o público.",
      pilar3_legendas: "Legendas puramente descritivas e passivas sem chamadas para ação (CTA) ou perguntas para comentários."
    };

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
        Você é o auditor de marketing do BagTV SaaS. Analise as postagens recentes do perfil @${instagramHandle}:
        Estatísticas: ${postsCarregados.length} posts analisados.
        Amostra de legendas: ${JSON.stringify(postsCarregados.map(p => p.nomePrato).slice(0, 5))}

        Gere um diagnóstico direto apontando os 3 principais gargalos do perfil em no máximo 2 frases por pilar.
        Retorne EXCLUSIVAMENTE este JSON válido:
        {
          "pilar1_iluminacao": "Análise sobre qualidade/iluminação/food porn das imagens",
          "pilar2_movimento": "Análise sobre dinamismo/vídeos/retenção de público",
          "pilar3_legendas": "Análise sobre legendas, ganchos e falta de chamadas para ação (CTA)"
        }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonClean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        diagnosticoDinamico = JSON.parse(jsonClean);
      } catch (e) {
        console.warn("Falha na análise da IA, utilizando padrão de auditoria:", e);
      }
    }

    return res.status(200).json({
      sucesso: true,
      diagnostico: diagnosticoDinamico,
      brandKit: {
        nomeEstabelecimento: instagramHandle,
        instagram: `@${instagramHandle}`,
        produtos: postsCarregados
      }
    });

  } catch (error: any) {
    return res.status(200).json({
      sucesso: false,
      erro: `Erro no processamento: ${error.message || 'Erro desconhecido'}`
    });
  }
}
