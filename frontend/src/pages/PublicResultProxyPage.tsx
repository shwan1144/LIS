import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';

export function PublicResultProxyPage() {
    const { id } = useParams<{ id: string }>();
    const apiBase = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');

    const resultUrl = `${apiBase}/public/results/${id}`;

    // Instead of using an iframe (which browsers block when rendering PDFs),
    // we simply redirect the user to the backend tracking page.
    useEffect(() => {
        window.location.replace(resultUrl);
    }, [resultUrl]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#64748b' }}>
            Redirecting to your result...
        </div>
    );
}
