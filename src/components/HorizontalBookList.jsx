import React from 'react';
import { useNavigate } from 'react-router-dom';

const BookCard = ({ book }) => {
    const navigate = useNavigate();
    return (
        <div
            className="card"
            style={{
                padding: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s',
                cursor: 'pointer',
                border: '1px solid var(--border-subtle)',
                position: 'relative',
                minWidth: '240px',
                flex: '0 0 auto'
            }}
            onClick={() => navigate(`/libro/${book.id}`)}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
            {book.isFavorite && (
                <div style={{ position: 'absolute', top: '8px', right: '8px', background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 5 }}>
                    ❤️ FAVORITO
                </div>
            )}
            <div style={{ position: 'relative', height: '140px' }}>
                <img
                    src={book.thumbnail || 'https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?q=80&w=2000&auto=format&fit=crop'}
                    alt={book.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?q=80&w=2000&auto=format&fit=crop'}
                />
                <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>
                    🎙️ {Math.floor((book.audioLength || 300) / 60)}m
                </div>
            </div>
            <div style={{ padding: '0.8rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.4rem', lineHeight: '1.3', height: '2.6em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{book.title}</h3>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{book.channelTitle}</div>
            </div>
        </div>
    );
};

const HorizontalBookList = ({ title, books, icon }) => {
    if (books.length === 0) return null;

    return (
        <div style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{title}</h2>
            </div>
            <div style={{
                display: 'flex',
                gap: '1.5rem',
                overflowX: 'auto',
                paddingBottom: '1rem',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
            }}>
                {books.map(book => <BookCard key={book.id} book={book} />)}
            </div>
        </div>
    );
};

export default HorizontalBookList;
