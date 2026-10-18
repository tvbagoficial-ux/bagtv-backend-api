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

    const apifyToken = process.env.APIFY_API_TOKEN;
    const apiKey = process.env.GEMINI_API_KEY;
    const sessionId = process.env.INSTAGRAM_SESSION_ID || "6db68c34d0b72d85";

    if (!apifyToken) {
      return res.status(200).json({ sucesso: false, erro: "Chave APIFY_API_TOKEN não configurada na Vercel." });
    }

    const actorId = "apify~instagram-scraper";
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const sessionCookies = [
      {
        name: "sessionid",
        value: sessionId,
        domain: ".instagram.com",
        path: "/",
        httpOnly: true,
        secure: true
      }
    ];

    // MODO 2: BENCHMARK MACRO VIRAL VIA REELS E BUSCA DE ALTO ALCANCE (ABA 2)
    if (body?.action === 'benchmark' && body?.niche) {
      const termoLimpo = body.niche.replace("#", "").trim().toLowerCase();

      if (!termoLimpo) {
        return res.status(200).json({ sucesso: false, erro: "Informe um nicho ou palavra-chave válida." });
      }

      // Payload configurado para puxar REELS virais em lote por busca interna no Apify
      const responseApify = await fetch(apifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: termoLimpo,
          searchType: "hashtag",
          resultsType: "reels",
          resultsLimit: 50,
          sessionCookie: sessionId,
          cookies: sessionCookies
        })
      });

      const itemsApify = responseApify.ok ? await responseApify.json() : [];

      // Mapeamento e cálculo do Score de Engajamento Bruto dos Reels
      const postsProcessados = Array.isArray(itemsApify) ? itemsApify
        .map((item: any, index: number) => {
          const shortCode = item.shortCode || item.code;
          const urlPost = item.url || (shortCode ? `https://www.instagram.com/reel/${shortCode}/` : null);
          const likes = item.likesCount || 0;
          const comments = item.commentsCount || 0;
          const followers = item.ownerFollowersCount || item.followersCount || item.owner?.followersCount || null;
          const totalPosts = item.ownerPostsCount || item.postsCount || item.owner?.postsCount || null;
          
          // Pontuação Bruta de Impacto Macro
          const scoreEngajamentoBruto = likes + (comments * 3);

          return {
            id: item.id || `bench-${index}`,
            autor: item.ownerUsername || "Criador do Instagram",
            seguidores: followers,
            totalPostsPerfil: totalPosts,
            legenda: item.caption || "Sem legenda",
            urlPost: urlPost,
            likesCount: likes,
            commentsCount: comments,
            scoreBruto: scoreEngajamentoBruto,
            tipo: "Reels / Vídeo",
            timestamp: item.timestamp ? new Date(item.timestamp).toLocaleDateString("pt-BR") : "Recente"
          };
        })
        .filter(p => !!p.urlPost && p.autor !== "Criador do Instagram")
        .sort((a, b) => b.scoreBruto - a.scoreBruto)
        : [];

      if (postsProcessados.length === 0) {
        return res.status(200).json({ 
          sucesso: false, 
          erro: `Nenhum Reels de alta relevância encontrado para o nicho "${termoLimpo}". Tente outro termo.` 
        });
      }

      const topPostsMacro = postsProcessados.slice(0, 10);

      // Desconstrução da Engenharia Reversa pelo Gemini
      let postsViraisComAnalise = [];
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-3.8-flash",
          generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Você é o Diretor de Criação e Inteligência de Mercado do BagTV SaaS.
        Analise a lista de REELS de MAIOR impacto e tração de engajamento do nicho "${termoLimpo}".
        Estes vídeos representam a elite de retenção e alcance do mercado.

        Amostra dos Campeões de Mercado:
        ${JSON.stringify(topPostsMacro)}

        Desconstrua a engenharia reversa desses vídeos virais para servir de referência na criação de mídias de alta conversão.
        Para cada um dos 10 vídeos, retorne EXCLUSIVAMENTE um array JSON estruturado exatamente assim:
        [
          {
            "autor": "username do criador/marca",
            "seguidores": 0,
            "totalPostsPerfil": 0,
            "urlPost": "link oficial da publicação",
            "likesCount": 0,
            "commentsCount": 0,
            "tipo": "Reels / Vídeo",
            "scoreViral": "👑 Referência Macro de Mercado",
            "pilarVisual": "Engenharia do gancho visual nos primeiros 3 segundos (enquadramento food porn, contraste, transição ou movimento)",
            "pilarHeadline": "Quebra de objeção, promessa do texto ou gancho na tela",
            "pilarAudioFormato": "Estrutura do formato (ASMR, ritmo de edição rápida, locução ou trilha comercial)",
            "pilarCtaRetencao": "Por que o vídeo gerou salvamentos, comentários e direcionamento de vendas"
          }
        ]
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonClean = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        postsViraisComAnalise = JSON.parse(jsonClean);
      }

      return res.status(200).json({
        sucesso: true,
        virais: postsViraisComAnalise.length > 0 ? postsViraisComAnalise : topPostsMacro
      });
    }

    // MODO 1: DIAGNÓSTICO DO PERFIL DO CLIENTE (ABA 1 - PERMANECE 100% INTACTO)
    const instagramRaw = body?.instagram || "";
    const instagramHandle = instagramRaw.replace("@", "").trim();

    if (!instagramHandle) {
      return res.status(200).json({ sucesso: false, erro: "Informe o Instagram do estabelecimento." });
    }

    const responseApify = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: [`[https://www.instagram.com/$](https://www.instagram.com/$){instagramHandle}/`],
        resultsLimit: 12,
        resultsType: "posts",
        sessionCookie: sessionId,
        cookies: sessionCookies
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

    let diagnosticoDinamico = null;
    if (apiKey && postsCarregados.length > 0) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.8-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const prompt = `
      Você é um auditor sênior de inteligência de marketing do BagTV SaaS.
      Faça uma análise profunda e realista do perfil do Instagram: @${instagramHandle}

      Amostra dos últimos posts extraídos:
      ${JSON.stringify(postsCarregados.map(p => ({
        legenda: p.nomePrato,
        likes: p.likesCount,
        comentarios: p.commentsCount,
        formato: p.categoria
      })).slice(0, 10))}

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
      const jsonClean = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      diagnosticoDinamico = JSON.parse(jsonClean);
    }

    if (!diagnosticoDinamico) {
      diagnosticoDinamico = {
        nichoIdentificado: "Análise de Perfil",
        pilar1_visual: "O perfil apresenta padrão estático de mídias com oportunidade para melhorar o enquadramento.",
        pilar2_formato: "Predominância de publicações estáticas no feed.",
        pilar3_copywriting: "Legendas focadas em descrições diretas.",
        planoAcao: "Aumentar a frequência de vídeos dinâmicos no formato Reels."
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
