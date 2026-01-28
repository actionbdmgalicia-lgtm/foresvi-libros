import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

const BookLibrary = () => {
    const [topics, setTopics] = useState([]);
    const [acceptedBooks, setAcceptedBooks] = useState([]);
    const [activeTopic, setActiveTopic] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!db) return;

        // Real-time listener for Topics
        let unsubscribeTopics = () => { };
        try {
            unsubscribeTopics = onSnapshot(collection(db, "topics"),
                (snapshot) => {
                    const fetchedTopics = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    setTopics(fetchedTopics);
                    if (fetchedTopics.length > 0 && !activeTopic) {
                        setActiveTopic(fetchedTopics[0].id);
                    }
                },
                (err) => console.error("Firestore Topics Error:", err)
            );
        } catch (err) {
            console.error("Error setting up topics listener:", err);
        }

        // Real-time listener for Books
        let unsubscribeBooks = () => { };
        try {
            const qBooks = query(collection(db, "books"), orderBy("acceptedDate", "desc"));
            unsubscribeBooks = onSnapshot(qBooks,
                (snapshot) => {
                    const books = snapshot.docs
                        .map(doc => ({ ...doc.data(), id: doc.id }))
                        .filter(b => b.isVisible !== false)
                        .sort((a, b) => {
                            if (a.recommended && !b.recommended) return -1;
                            if (!a.recommended && b.recommended) return 1;
                            return 0; // Already sorted by date in query
                        });
                    setAcceptedBooks(books);
                },
                (err) => console.error("Firestore Books Error:", err)
            );
        } catch (err) {
            console.error("Error setting up books listener:", err);
        }

        return () => {
            unsubscribeTopics();
            unsubscribeBooks();
        };
    }, [activeTopic]);

    const filteredBooks = acceptedBooks.filter(b => b.topicId == activeTopic);

    return (
        <section style={{ padding: '2rem 0', background: 'var(--bg-secondary)' }}>
            <div className="container" style={{ maxWidth: '1200px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Últimos Resúmenes <span className="text-gradient">Validados</span></h2>

                    {/* Compact Topic Tabs */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {topics.map(topic => (
                            <button
                                key={topic.id}
                                onClick={() => setActiveTopic(topic.id)}
                                className={`btn ${activeTopic === topic.id ? 'btn-primary' : ''}`}
                                style={{
                                    borderRadius: '8px',
                                    padding: '0.4rem 0.8rem',
                                    fontSize: '0.8rem',
                                    background: activeTopic === topic.id ? 'var(--accent-primary)' : 'white',
                                    color: activeTopic === topic.id ? 'white' : 'var(--text-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {topic.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Compact Content Groups */}
                {filteredBooks.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {['Iniciación', 'Intermedio', 'Avanzado'].map(level => {
                            const levelBooks = filteredBooks.filter(b => b.level === level);
                            if (levelBooks.length === 0) return null;

                            return (
                                <div key={level}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nivel {level}</div>
                                        <div style={{ height: '1px', background: 'var(--border-subtle)', flex: 1 }}></div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                                        {levelBooks.map(book => (
                                            <div key={book.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'transform 0.2s', cursor: 'pointer', border: '1px solid var(--border-subtle)', position: 'relative' }}
                                                onClick={() => navigate(`/libro/${book.id}`)}
                                                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
                                                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                            >
                                                {book.recommended && (
                                                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--accent-gold)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 5, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                                                        ESTRELLA 🌟
                                                    </div>
                                                )}
                                                <div style={{ position: 'relative', height: '140px' }}>
                                                    <img src={book.thumbnail} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>
                                                        🎙️ {Math.floor((book.audioLength || 300) / 60)}m
                                                    </div>
                                                </div>
                                                <div style={{ padding: '0.8rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                    <h3 style={{ fontSize: '0.95rem', marginBottom: '0.4rem', lineHeight: '1.3', height: '2.6em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{book.title}</h3>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>{book.channelTitle}</div>

                                                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: 'auto' }}>
                                                        {book.hasAudio && <span title="Audio disponible" style={{ fontSize: '0.7rem', background: '#f0fdf4', color: '#166534', padding: '3px 6px', borderRadius: '4px' }}>🎙️ Audio</span>}
                                                        <span title="Texto disponible" style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#1e40af', padding: '3px 6px', borderRadius: '4px' }}>📝 Texto</span>
                                                        <span title="Video original" style={{ fontSize: '0.7rem', background: '#fff7ed', color: '#9a3412', padding: '3px 6px', borderRadius: '4px' }}>📺 Video</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', background: 'white', borderRadius: '12px', border: '1px dashed var(--border-subtle)' }}>
                        <p style={{ fontSize: '0.9rem' }}>Pulsa una categoría para visualizar los libros.</p>
                    </div>
                )}
            </div>
        </section>
    );
};

export default BookLibrary;
