import type { VercelRequest, VercelResponse } from '@vercel/node';

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

    const instagramRaw = body?.instagram || "@lafrittellapanquecaria";
    const instagramHandle = instagramRaw.replace("@", "").trim();

    // Chaves das variáveis de ambiente na Vercel
    const apifyToken = process.env.APIFY_API_TOKEN;

    if (!apifyToken) {
      return res.status(200).json({
        sucesso: false,
        erro: "Chave APIFY_API_TOKEN não configurada nas variáveis de ambiente da Vercel."
      });
    }

    // 1. Chamada síncrona ao Apify Instagram Scraper (ordem do mais recente para o antigo)
    const actorId = "apify~instagram-scraper";
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const responseApify = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${instagramHandle}/`],
        resultsLimit: 12, // Traz os 12 posts mais recentes
        resultsType: "posts"
      })
    });

    if (!responseApify.ok) {
      throw new Error(`Falha na API do Apify: HTTP status ${responseApify.status}`);
    }

    const itemsApify = await responseApify.json();

    if (!Array.isArray(itemsApify) || itemsApify.length === 0) {
      return res.status(200).json({
        sucesso: false,
        erro: "Nenhum post público encontrado para este perfil do Instagram."
      });
    }

    // 2. Formatação dos Posts Brutos (Do mais recente ao mais antigo)
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

    return res.status(200).json({
      sucesso: true,
      brandKit: {
        nomeEstabelecimento: "La Frittella Panquecaria",
        instagram: `@${instagramHandle}`,
        produtos: postsCarregados
      }
    });

  } catch (error: any) {
    return res.status(200).json({
      sucesso: false,
      erro: `Erro no processamento do Apify: ${error.message || 'Erro desconhecido'}`
    });
  }
}
