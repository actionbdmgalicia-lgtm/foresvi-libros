import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ReactPlayer from 'react-player';
import { coursesData } from '../data/courses';

const CourseDetail = () => {
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState('contenidos');
    const [course, setCourse] = useState(null);

    useEffect(() => {
        const foundCourse = coursesData.find(c => c.id === parseInt(id));
        if (foundCourse) {
            setCourse(foundCourse);
        }
    }, [id]);

    if (!course) return <div className="container" style={{ paddingTop: '100px' }}>Cargando curso...</div>;

    return (
        <div style={{ paddingTop: '80px', minHeight: '100vh', background: 'var(--bg-secondary)' }}>
            {/* Header Section */}
            <div style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)', padding: '2rem 0' }}>
                <div className="container">
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', background: 'rgba(32, 33, 137, 0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{course.tags[0]}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{course.level}</span>
                    </div>
                    <h1>{course.title}</h1>
                    <p style={{ maxWidth: '800px', fontSize: '1.1rem', marginBottom: '1.5rem' }}>{course.description}</p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{course.instructor.charAt(0)}</div>
                            <div>
                                <div style={{ fontWeight: '600' }}>{course.instructor}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{course.role}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
                            🛡️ {course.validation} Validado por la comunidad
                        </div>
                    </div>
                </div>
            </div>

            <div className="container" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginTop: '2rem', paddingBottom: '4rem' }}>
                {/* Main Content (Video Player) */}
                <div>
                    <div style={{
                        aspectRatio: '16/9',
                        background: 'black',
                        borderRadius: '16px',
                        marginBottom: '1.5rem',
                        overflow: 'hidden',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                    }}>
                        <ReactPlayer
                            url={course.videoUrl}
                            width="100%"
                            height="100%"
                            controls={true}
                        />
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
                        <button
                            onClick={() => setActiveTab('contenidos')}
                            style={{
                                padding: '0.5rem 0',
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === 'contenidos' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                color: activeTab === 'contenidos' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                fontWeight: '600'
                            }}>
                            Contenidos
                        </button>
                        <button
                            onClick={() => setActiveTab('comunidad')}
                            style={{
                                padding: '0.5rem 0',
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === 'comunidad' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                color: activeTab === 'comunidad' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                fontWeight: '600'
                            }}>
                            Validación y Comunidad
                        </button>
                        <button
                            onClick={() => setActiveTab('recursos')}
                            style={{
                                padding: '0.5rem 0',
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === 'recursos' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                color: activeTab === 'recursos' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                fontWeight: '600'
                            }}>
                            Recursos VIP
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'contenidos' && (
                        <div>
                            <h3 style={{ marginBottom: '1rem' }}>Acerca de este curso</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                                Este curso está diseñado para instaladores que quieren optimizar sus tiempos y asegurar la máxima eficiencia energética en sus montajes. Trataremos normativa actual, herramientas especializadas y casos prácticos de errores reales.
                            </p>
                        </div>
                    )}

                    {activeTab === 'comunidad' && (
                        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>¿Es útil este contenido?</h3>
                            <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>Tu voto ayuda a filtrar el contenido de calidad.</p>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button className="btn btn-primary" style={{ flex: 1 }}>👍 Sí, es Oro (Útil)</button>
                                <button className="btn btn-outline" style={{ flex: 1, borderColor: '#ef4444', color: '#ef4444' }}>👎 No, es Paja (Relleno)</button>
                            </div>
                        </div>
                    )}
                    {activeTab === 'recursos' && (
                        <div style={{ background: 'rgba(180, 83, 9, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--accent-gold)' }}>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--accent-gold)' }}>🔒 Área VIP</h3>
                            <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Los usuarios VIP tienen acceso a:</p>
                            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li>Manual de anclajes en PDF</li>
                                <li>Calculadora de strings Excel</li>
                                <li>Certificado de finalización</li>
                            </ul>
                            <button className="btn" style={{ background: 'var(--accent-gold)', color: 'white', width: '100%' }}>Hacerme VIP para descargar</button>
                        </div>
                    )}

                </div>

                {/* Sidebar (Curriculum) */}
                <div>
                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid var(--border-subtle)', overflow: 'hidden', position: 'sticky', top: '100px' }}>
                        <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)', fontWeight: '600' }}>
                            Temario del Curso
                        </div>
                        <div>
                            {course.modules.length > 0 ? course.modules.map((mod, index) => (
                                <div key={index}>
                                    <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', fontWeight: '500', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        {mod.title}
                                    </div>
                                    {mod.lessons.map((lesson, lIndex) => (
                                        <div key={lIndex} style={{
                                            padding: '0.75rem 1rem',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            cursor: lesson.locked ? 'not-allowed' : 'pointer',
                                            background: lesson.locked ? 'rgba(0,0,0,0.02)' : 'white'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.8rem' }}>{lesson.locked ? '🔒' : '📺'}</span>
                                                <span style={{ fontSize: '0.9rem', color: lesson.locked ? 'var(--text-muted)' : 'var(--text-primary)' }}>{lesson.title}</span>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{lesson.duration}</span>
                                        </div>
                                    ))}
                                </div>
                            )) : (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    Temario disponible próximamente
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CourseDetail;
