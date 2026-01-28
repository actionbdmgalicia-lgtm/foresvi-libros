import React from 'react';
import { Link } from 'react-router-dom';
import { coursesData } from '../data/courses';

const FeaturedCourses = () => {
    const courses = coursesData;

    return (
        <section id="courses" style={{ background: '#f8fafc', padding: '2.5rem 0' }}>
            <div className="container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Libros <span className="text-gradient">Recomendados</span></h2>
                    <button className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Catálogo Completo</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                    {courses.map((course) => (
                        <div key={course.id} className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ position: 'relative', height: '140px' }}>
                                <img src={course.image} alt={course.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'white', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                                    🛡️ {course.validation}
                                </div>
                            </div>

                            <div style={{ padding: '0.8rem' }}>
                                <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem' }}>
                                    <span style={{ fontSize: '0.65rem', background: 'var(--bg-tertiary)', padding: '2px 5px', borderRadius: '4px' }}>{course.level}</span>
                                </div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem', lineHeight: '1.3' }}>{course.title}</h3>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.8rem', paddingTop: '0.6rem', borderTop: '1px solid #f1f5f9' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>⏱ {course.duration}</div>
                                    <Link to={`/libro/${course.id}`} className="btn btn-primary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}>Ver Libro</Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FeaturedCourses;
