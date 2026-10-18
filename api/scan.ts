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

    if (!apifyToken) {
      return res.status(200).json({ sucesso: false, erro: "Chave APIFY_API_TOKEN não configurada na Vercel." });
    }

    const actorId = "apify~instagram-scraper";
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    // MODO 2: PESQUISA DE BENCHMARK AUTÔNOMA (ABA 2)
    if (body?.action === 'benchmark' && body?.niche) {
      const nicheQuery = body.niche.trim();

      const responseApify = await fetch(apifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: nicheQuery,
          searchType: "hashtag",
          resultsLimit: 15,
          resultsType: "posts"
        })
      });

      const itemsApify = responseApify.ok ? await responseApify.json() : [];

      const postsBrutos = Array.isArray(itemsApify) ? itemsApify.map((item: any, index: number) => ({
        id: item.id || `bench-${index}`,
        autor: item.ownerUsername || "Desconhecido",
        legenda: item.caption || "Sem legenda",
        urlFoto: item.displayUrl || item.url || (item.images && item.images[0]),
        likesCount: item.likesCount || 0,
        commentsCount: item.commentsCount || 0,
        tipo: item.type === "Video" ? "Reels / Vídeo" : "Foto Feed",
        timestamp: item.timestamp ? new Date(item.timestamp).toLocaleDateString("pt-BR") : "Recente"
      })).filter(p => !!p.urlFoto) : [];

      if (postsBrutos.length === 0) {
        return res.status(200).json({ sucesso: true, virais: [] });
      }

      // Gemini IA analisa os posts e extrai os 4 pilares do gancho dinamicamente
      let postsViraisComAnalise = [];
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Você é um estrategista sênior de marketing digital e engenharia reversa de conteúdo viral.
        Analise a lista de posts do Instagram abaixo coletados do nicho "${nicheQuery}".
        Selecione os posts com maior potencial de viralidade (outliers) e desconstrua o motivo do sucesso.

        Posts coletados:
        ${JSON.stringify(postsBrutos.slice(0, 10))}

        Para cada post selecionado, retorne um objeto JSON contendo:
        - "autor": username do criador
        - "urlFoto": url da imagem/vídeo fornecida
        - "likesCount": número de likes
        - "commentsCount": número de comentários
        - "tipo": formato (Reels / Foto)
        - "scoreViral": estimativa de impacto (ex: "4.8x Acima da Média")
        - "pilarVisual": Análise do gancho visual nos primeiros segundos/capa.
        - "pilarHeadline": Análise do texto/headline exibido.
        - "pilarAudioFormato": Análise do formato de áudio ou ritmo de edição.
        - "pilarCtaRetencao": Análise da retenção e chamada para ação (CTA).

        Retorne EXCLUSIVAMENTE um array JSON válido estruturado assim:
        [
          {
            "autor": "...",
            "urlFoto": "...",
            "likesCount": 0,
            "commentsCount": 0,
            "tipo": "...",
            "scoreViral": "...",
            "pilarVisual": "...",
            "pilarHeadline": "...",
            "pilarAudioFormato": "...",
            "pilarCtaRetencao": "..."
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
        virais: postsViraisComAnalise.length > 0 ? postsViraisComAnalise : postsBrutos
      });
    }

    // MODO 1: ESCANEAMENTO DE PERFIL (ABA 1)
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

    let diagnosticoDinamico = null;
    if (apiKey && postsCarregados.length > 0) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
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
