import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import Hero from '../components/Hero';
import Methodology from '../components/Methodology';
import Pricing from '../components/Pricing';
import CallToAction from '../components/CallToAction';
import BookLibrary from '../components/BookLibrary';
import HorizontalBookList from '../components/HorizontalBookList';

const Home = () => {
    const [favorites, setFavorites] = useState([]);
    const [latest, setLatest] = useState([]);
    const [recommended, setRecommended] = useState([]);

    useEffect(() => {
        if (!db) return;

        let unsubscribe = () => { };
        try {
            const q = query(collection(db, "books"), orderBy("acceptedDate", "desc"));
            unsubscribe = onSnapshot(q,
                (snapshot) => {
                    const visibleBooks = snapshot.docs
                        .map(doc => ({ ...doc.data(), id: doc.id }))
                        .filter(b => b.isVisible !== false);

                    setFavorites(visibleBooks.filter(book => book.isFavorite));
                    setRecommended(visibleBooks.filter(book => book.recommended));
                    setLatest(visibleBooks.slice(0, 3));
                },
                (err) => console.error("Firestore Home Error:", err)
            );
        } catch (err) {
            console.error("Error setting up Home listener:", err);
        }

        return () => unsubscribe();
    }, []);

    return (
        <>
            <Hero />

            <div className="container" style={{ marginTop: '2rem' }}>
                <HorizontalBookList title="Mis Favoritos" books={favorites} icon="❤️" />
                <HorizontalBookList title="Recomendados por Foresvi" books={recommended} icon="🌟" />
                <HorizontalBookList title="Últimos Añadidos" books={latest} icon="🕒" />
            </div>

            <Methodology />

            {/* Dynamic Audiobook Library */}
            <div id="library">
                <BookLibrary />
            </div>

            <Pricing />
            <CallToAction />
        </>
    );
};

export default Home;
