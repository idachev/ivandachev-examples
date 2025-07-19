// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5;

// CORS configuration
function getCorsHeaders(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = env.ALLOWED_ORIGINS ? 
        env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : 
        ['http://localhost:8788', 'http://localhost:4000'];
    
    // Check if origin is allowed
    let allowedOrigin = allowedOrigins.find(allowed => origin.startsWith(allowed));
    
    // For development: allow any localhost port
    if (!allowedOrigin && origin.match(/^https?:\/\/localhost:\d+$/)) {
        allowedOrigin = origin;
    }
    
    return {
        'Access-Control-Allow-Origin': allowedOrigin || allowedOrigins[0],
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        'Access-Control-Max-Age': '86400',
    };
}

// Handle OPTIONS request for CORS preflight
export async function onRequestOptions({ request, env }) {
    return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request, env)
    });
}

export async function onRequestPost({ request, env }) {
    const corsHeaders = getCorsHeaders(request, env);
    
    try {
        // Get client IP
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        
        // Check rate limit
        const rateLimitKey = `ratelimit-${clientIp}`;
        const attempts = await env.CONTACT_SUBMISSIONS.get(rateLimitKey);
        
        if (attempts && parseInt(attempts) >= MAX_REQUESTS) {
            return new Response(JSON.stringify({ 
                error: 'Too many requests. Please try again later.' 
            }), { 
                status: 429,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        // Increment attempt counter
        await env.CONTACT_SUBMISSIONS.put(
            rateLimitKey, 
            String((parseInt(attempts) || 0) + 1),
            { expirationTtl: RATE_LIMIT_WINDOW / 1000 }
        );
        
        // Parse request body
        const body = await request.json();
        const { name, email, message } = body;
        
        // Validate input
        if (!name || !email || !message) {
            return new Response(JSON.stringify({ 
                error: 'All fields are required' 
            }), { 
                status: 400,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return new Response(JSON.stringify({ 
                error: 'Invalid email address' 
            }), { 
                status: 400,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        // Get validation limits from environment or use defaults
        const minNameLength = env.MIN_NAME_LENGTH || 2;
        const maxNameLength = env.MAX_NAME_LENGTH || 200;
        const minMessageLength = env.MIN_MESSAGE_LENGTH || 50;
        const maxMessageLength = env.MAX_MESSAGE_LENGTH || 8000;
        
        // Validate field lengths
        if (name.length < minNameLength || name.length > maxNameLength) {
            return new Response(JSON.stringify({ 
                error: `Name must be between ${minNameLength} and ${maxNameLength} characters` 
            }), { 
                status: 400,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        if (message.length < minMessageLength || message.length > maxMessageLength) {
            return new Response(JSON.stringify({ 
                error: `Message must be between ${minMessageLength} and ${maxMessageLength} characters` 
            }), { 
                status: 400,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        // Generate unique ID for submission
        const submissionId = `contact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Prepare submission data
        const submission = {
            id: submissionId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            message: message.trim(),
            timestamp: new Date().toISOString(),
            ip: clientIp,
            country: request.headers.get('CF-IPCountry') || 'unknown',
            userAgent: request.headers.get('User-Agent') || 'unknown'
        };
        
        // Store in KV
        await env.CONTACT_SUBMISSIONS.put(
            submissionId, 
            JSON.stringify(submission), 
            {
                metadata: { 
                    email: submission.email, 
                    timestamp: submission.timestamp 
                }
            }
        );
        
        return new Response(JSON.stringify({ 
            success: true, 
            id: submissionId,
            message: 'Your message has been sent successfully!' 
        }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
        
    } catch (error) {
        console.error('Error processing contact form:', error);
        return new Response(JSON.stringify({ 
            error: 'An internal error occurred. Please try again later.' 
        }), { 
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    }
}

// GET handler to retrieve submissions
export async function onRequestGet({ request, env }) {
    const corsHeaders = getCorsHeaders(request, env);
    
    // Check API key in query params or header
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('api_key') || request.headers.get('X-API-Key');
    
    // If no API key or invalid API key, return status message
    if (!env.API_KEY || apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({
            status: 'Contact form API is running',
            timestamp: new Date().toISOString()
        }), {
            headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    }
    
    // If API key is valid, return list of submissions
    try {
        const { keys } = await env.CONTACT_SUBMISSIONS.list();
        const submissions = [];
        
        for (const key of keys) {
            const data = await env.CONTACT_SUBMISSIONS.get(key.name);
            if (data) {
                submissions.push(JSON.parse(data));
            }
        }
        
        // Sort by timestamp (newest first)
        submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return new Response(JSON.stringify({
            submissions,
            count: submissions.length,
            timestamp: new Date().toISOString()
        }), {
            headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
        
    } catch (error) {
        console.error('Error fetching submissions:', error);
        return new Response(JSON.stringify({ 
            error: 'Failed to fetch submissions' 
        }), { 
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    }
}