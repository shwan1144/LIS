import { useParams } from 'react-router-dom';

export function PublicResultProxyPage() {
    const { id } = useParams<{ id: string }>();
    const apiBase = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');

    // Construct the URL to the backend API which serves the HTML view
    const resultUrl = `${apiBase}/public/results/${id}`;

    return (
        <iframe
            title="Public Result"
            src={resultUrl}
            style={{
                width: '100vw',
                height: '100vh',
                border: 'none',
                display: 'block',
                margin: 0,
                padding: 0,
            }}
        />
    );
}
