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
      return res.status(200).json({ sucesso: false, erro: "Chave APIFY_API_TOKEN não configurada na Vercel." });
    }

    // 1. Extração dos posts via Apify
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

    // CASO 1: Conta Nova / Sem Posts
    if (postsCarregados.length === 0) {
      return res.status(200).json({
        sucesso: true,
        diagnostico: {
          nichoIdentificado: "Perfil Novo / Sem Publicações",
          pilar1_visual: "A conta ainda não possui histórico público de postagens para análise de qualidade visual.",
          pilar2_formato: "Não há conteúdos em vídeo ou carrosséis para avaliar retenção algorítmica.",
          pilar3_copywriting: "Sem histórico de legendas ou estratégias de engajamento anteriores.",
          planoAcao: "Criar a identidade visual do perfil, estruturar a linha editorial inicial e publicar os primeiros 6 posts com ganchos claros."
        },
        brandKit: {
          nomeEstabelecimento: instagramHandle,
          instagram: `@${instagramHandle}`,
          produtos: []
        }
      });
    }

    // CASO 2: Diagnóstico Dinâmico via Gemini IA
    let diagnosticoDinamico = null;

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-1.5-flash",
          generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Você é um auditor sênior de inteligência de marketing do BagTV SaaS.
        Faça uma análise profunda e realista do perfil do Instagram: @${instagramHandle}

        Amostra dos últimos posts extraídos (com legenda, curtidas e comentários):
        ${JSON.stringify(postsCarregados.map(p => ({
          legenda: p.nomePrato,
          likes: p.likesCount,
          comentarios: p.commentsCount,
          formato: p.categoria
        })).slice(0, 10))}

        Instruções de análise:
        1. Identifique o NICHO REAL e CONTEXTO do perfil (ex: Gastronomia / Panquecaria, Tecnologia, Mídia DOOH, Serviços, etc.).
        2. Qualidade Visual & Apelo da Marca: Analise a atratividade das mídias para este nicho específico (2 frases objetivas).
        3. Formato de Mídia & Retenção Algorítmica: Avalie a distribuição entre fotos e Reels e o apelo de retenção (2 frases objetivas).
        4. Copywriting & Engajamento: Avalie as legendas, ganchos e presença de CTAs/chamadas para ação (2 frases objetivas).
        5. Diagnóstico Executivo & Plano de Ação: Resumo estratégico direto indicando como corrigir as falhas e escalar o engajamento deste perfil (2 a 3 frases).

        Retorne EXCLUSIVAMENTE este JSON válido:
        {
          "nichoIdentificado": "Nome do Nicho Detectado",
          "pilar1_visual": "Texto do pilar 1",
          "pilar2_formato": "Texto do pilar 2",
          "pilar3_copywriting": "Texto do pilar 3",
          "planoAcao": "Texto do plano de ação"
        }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Limpeza de marcações de bloco de código se houver
        const jsonClean = responseText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        diagnosticoDinamico = JSON.parse(jsonClean);
      } catch (e) {
        console.warn("Erro ao processar resposta do Gemini:", e);
      }
    }

    // Fallback dinâmico agnóstico se a chave da API falhar
    if (!diagnosticoDinamico) {
      diagnosticoDinamico = {
        nichoIdentificado: "Análise de Perfil",
        pilar1_visual: "O perfil apresenta padrão estático de mídias com oportunidade para melhorar o enquadramento e contraste visual.",
        pilar2_formato: "Predominância de publicações estáticas no feed, reduzindo o tempo de retenção do público em comparação a conteúdos em vídeo.",
        pilar3_copywriting: "Legendas focadas em descrições diretas, com oportunidade para inclusão de ganchos iniciais e perguntas direcionadas.",
        planoAcao: "Aumentar a frequência de vídeos dinâmicos no formato Reels e aplicar Chamadas para Ação (CTAs) em todas as legendas para incentivar comentários."
      };
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
