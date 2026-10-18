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
      return res.status(200).json({ sucesso: false, erro: "Chave APIFY_API_TOKEN não configurada na Vercel." });
    }

    // 1. Raspagem dos posts via Apify
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

    // ETAPA 1: Tratamento para perfis novos / sem posts
    if (postsCarregados.length === 0) {
      return res.status(200).json({
        sucesso: true,
        diagnostico: {
          nichoIdentificado: "Perfil Novo / Sem Publicações",
          pilar1_visual: "A conta não possui postagens arquivadas para auditoria visual.",
          pilar2_formato: "Sem histórico de Reels ou conteúdos em vídeo cadastrados.",
          pilar3_copywriting: "Sem histórico de legendas ou copys cadastradas.",
          planoAcao: "Definir a linha editorial inicial, paleta de cores e publicar os primeiros 6 posts de posicionamento."
        },
        brandKit: {
          nomeEstabelecimento: instagramHandle,
          instagram: `@${instagramHandle}`,
          produtos: []
        }
      });
    }

    // ETAPAS 2, 3 e 4: Identificação de Nicho, Auditoria por Pilares e Diagnóstico/Ações Recomendadas via Gemini
    let diagnosticoDinamico = {
      nichoIdentificado: "Geral",
      pilar1_visual: "Análise visual pendente.",
      pilar2_formato: "Análise de retenção pendente.",
      pilar3_copywriting: "Análise de engajamento pendente.",
      planoAcao: "Aguardando processamento de inteligência."
    };

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
        Você é um auditor estratégico de inteligência de marketing do SaaS BagTV.
        Analise o perfil do Instagram: @${instagramHandle}

        Legendas e posts extraídos do perfil:
        ${JSON.stringify(postsCarregados.map(p => p.nomePrato).slice(0, 8))}

        Siga rigorosamente estas instruções:
        1. Identifique o NICHO REAL e CONTEXTO do perfil com base nos textos extraídos.
        2. Avalie o pilar de Atratividade Visual & Qualidade da Marca para este nicho específico (2 frases).
        3. Avalie o pilar de Formato de Conteúdo, Mídias & Retenção Algorítmica (2 frases).
        4. Avalie o pilar de Copywriting, Engajamento & Chamadas para Ação / CTAs (2 frases).
        5. Forneça o DIAGNÓSTICO FINAL e o PLANO DE AÇÕES RECOMENDADAS para alavancar o alcance deste perfil (2 a 3 frases práticas).

        Retorne EXCLUSIVAMENTE este JSON válido sem formatação markdown adicional:
        {
          "nichoIdentificado": "Nome do Nicho Detectado",
          "pilar1_visual": "Texto da análise visual para o nicho",
          "pilar2_formato": "Texto da análise de formatos e retenção",
          "pilar3_copywriting": "Texto da análise de copywriting e CTAs",
          "planoAcao": "Diagnóstico executivo e plano de ações recomendadas"
        }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonClean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        diagnosticoDinamico = JSON.parse(jsonClean);
      } catch (e) {
        console.warn("Falha ao gerar relatório dinâmico via Gemini:", e);
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
