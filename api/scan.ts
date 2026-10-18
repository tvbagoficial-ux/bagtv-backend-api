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

    const instagramRaw = body?.instagram || "@tvbagoficial";
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

    const itemsApify = responseApify.ok ? await responseApify.json() : [];

    // Formatação dos posts retornados
    const postsCarregados = Array.isArray(itemsApify) ? itemsApify.map((item: any, index: number) => ({
      id: item.id || `post-${index}`,
      nomePrato: item.caption || "Publicação do Instagram",
      preco: "Post Instagram",
      categoria: item.type === "Video" ? "Reels / Vídeo" : "Foto Feed",
      urlFoto: item.displayUrl || item.url || (item.images && item.images[0]),
      likesCount: item.likesCount || 0,
      commentsCount: item.commentsCount || 0,
      timestamp: item.timestamp ? new Date(item.timestamp).toLocaleDateString("pt-BR") : "Recente"
    })).filter(post => !!post.urlFoto) : [];

    // CASO 1: Perfil novo sem publicações
    if (postsCarregados.length === 0) {
      return res.status(200).json({
        sucesso: true,
        diagnostico: {
          nichoIdentificado: "Perfil Novo / Sem Publicações",
          pilar1_visual: "A conta ainda não possui publicações para avaliar padrão de imagens.",
          pilar2_formato: "Sem histórico de Reels ou conteúdos em vídeo cadastrados.",
          pilar3_copywriting: "Necessário criar a linha editorial inicial com ganchos e CTAs para atração de seguidores."
        },
        brandKit: {
          nomeEstabelecimento: instagramHandle,
          instagram: `@${instagramHandle}`,
          produtos: []
        }
      });
    }

    // CASO 2: Análise Agnóstica e Dinâmica via Gemini IA
    let diagnosticoDinamico = {
      nichoIdentificado: "Geral",
      pilar1_visual: "Avaliação visual pendente de processamento por IA.",
      pilar2_formato: "Análise de formatos e retenção algorítmica pendente.",
      pilar3_copywriting: "Análise de copywriting e engajamento pendente."
    };

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
        Você é um auditor de marketing digital agnóstico do SaaS BagTV.
        Analise de forma personalizada o perfil do Instagram: @${instagramHandle}

        Amostra de legendas/posts recentes extraídos:
        ${JSON.stringify(postsCarregados.map(p => p.nomePrato).slice(0, 6))}

        Sua tarefa:
        1. Identifique o NICHO do perfil (ex: Tecnologia, Publicidade DOOH, Gastronomia, Moda, Fitness, Serviços, etc.).
        2. Gere um diagnóstico ultra-específico e contextualizado para este nicho sem inventar informações.
        
        Retorne EXCLUSIVAMENTE este JSON válido:
        {
          "nichoIdentificado": "Nome do Nicho Detectado",
          "pilar1_visual": "Análise da atratividade e padrão visual para este nicho específico em 2 frases.",
          "pilar2_formato": "Análise de formatos de mídia (Reels x Estático x Carrossel) e retenção em 2 frases.",
          "pilar3_copywriting": "Análise sobre o tom de voz das legendas, ganchos e presença de Chamadas para Ação (CTA) em 2 frases."
        }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonClean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        diagnosticoDinamico = JSON.parse(jsonClean);
      } catch (e) {
        console.warn("Falha na chamada Gemini IA, usando fallback básico:", e);
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
