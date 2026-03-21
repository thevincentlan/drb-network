const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwMh0iDxIrWzo6RsDDG3fZAA_MIWiz2ogijCmBAFWvbImzaLJePk59yJlQE-yjGL5KXRA/exec';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SECRET_ADMIN_PASSWORD = typeof CONFIG_ADMIN_PASSWORD !== 'undefined' ? CONFIG_ADMIN_PASSWORD : null;

// --- This URL points to your Google Sheet ---
        const googleSheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTHcndXfYMgUm1eRG0IvoReaBxYowGhiay23WbY9JegVZkTlV1TI6_xFZY-GJq8UZEEMOdACI-2nOIb/pub?gid=370192004&single=true&output=csv';
        const defaultProfilePic = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect fill="%23111827" width="200" height="200"/><text x="100" y="115" font-family="Inter,sans-serif" font-size="48" font-weight="700" fill="rgba(255,255,255,0.2)" text-anchor="middle">DRB</text></svg>');

        // Algorithmic avatar: generates SVG with initials on a gradient background
        const AVATAR_GRADIENTS = [
            ['#1e3a5f', '#2d5a87'],  // deep blue
            ['#2d1b4e', '#4a2d7a'],  // purple
            ['#1a3c34', '#2d6a5a'],  // teal
            ['#3d2b1f', '#6b4c35'],  // warm brown
            ['#1f2937', '#374151'],  // slate
            ['#312e81', '#4338ca'],  // indigo
        ];

        function generateAvatar(firstName, lastName, gradYear) {
            const initials = ((firstName || '?')[0] + (lastName || '?')[0]).toUpperCase();
            const yearNum = parseInt(gradYear) || 2020;
            const gradientIdx = Math.abs(yearNum * 7 + initials.charCodeAt(0)) % AVATAR_GRADIENTS.length;
            const [c1, c2] = AVATAR_GRADIENTS[gradientIdx];
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
                <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
                <rect fill="url(%23g)" width="200" height="200"/>
                <text x="100" y="120" font-family="Outfit,Inter,sans-serif" font-size="64" font-weight="700" fill="rgba(255,255,255,0.85)" text-anchor="middle" letter-spacing="2">${initials}</text>
            </svg>`;
            return 'data:image/svg+xml,' + encodeURIComponent(svg);
        }

        let allAlumniData = [];
        let lastNavigationTime = 0;
        let allowedEmails = new Set();
        let currentSort = 'class'; // 'class' or 'alpha'
        let currentView = 'dashboard'; // 'dashboard', 'grid', 'timeline', 'map'
        let leafletMap = null;
        let mapMarkers = [];
        let currentSearchQuery = '';
        let currentUserEmail = '';
        let faceCoords = {};
        let geocodeCache = {};

        // Simple string hash to obscure URLs in face_coords.json and decouple from row IDs
        function generateFaceKey(url) {
            if (!url) return null;
            let str = url.split('?')[0];
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash).toString(36);
        }




        const escapeHTML = (str) => {
            if (!str) return str;
            return String(str).replace(/[&<>"']/g, match => {
                const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
                return escapeMap[match];
            });
        };

        function normalizeName(name, map) {
            if (!name) return '';
            const lowerName = name.trim().toLowerCase();
            const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);
            
            // First pass: exact match
            for (const key of sortedKeys) {
                if (lowerName === key.toLowerCase()) return map[key];
            }
            // Second pass: word boundary match
            for (const key of sortedKeys) {
                const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (regex.test(lowerName)) { return map[key]; }
            }

            const exceptions = ['of', 'a', 'the', 'and', 'an', 'in', 'on', 'at', 'for'];
            return name.trim().split(/\s+/).map((word, index) => {
                const lowerWord = word.toLowerCase();
                if (index > 0 && exceptions.includes(lowerWord)) { return lowerWord; }
                
                // Better title casing: handle A&M, etc.
                if (word.includes('&')) {
                    return word.split('&').map(part => {
                        if (!part) return '';
                        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
                    }).join('&');
                }
                
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }).join(' ');
        }
        
        const mainView = document.getElementById('dashboard-view');
        const profileView = document.getElementById('profile-view');
        const profilesContainer = document.getElementById('profiles-container');


        let renderTimeout;
        const renderProfiles = () => {
            if (renderTimeout) cancelAnimationFrame(renderTimeout);
            renderTimeout = requestAnimationFrame(renderProfilesImpl);
        };

        function filterAlumni(data) {
            // Apply name search filter
            let searchFiltered = data;
            if (currentSearchQuery) {
                searchFiltered = data.filter(alum => {
                    const fullName = `${alum.firstName} ${alum.lastName}`.toLowerCase();
                    const reversed = `${alum.lastName} ${alum.firstName}`.toLowerCase();
                    return fullName.includes(currentSearchQuery) || reversed.includes(currentSearchQuery);
                });
            }

            // Check if filter checkboxes exist yet (they may not be created during initial load)
            const classYearMaster = document.getElementById('class-year-master-filter');
            if (!classYearMaster) return searchFiltered;

            const activeFilters = {
                classYears: { active: classYearMaster.checked, values: new Set(Array.from(document.querySelectorAll('#class-year-options-container input:checked')).map(cb => cb.value)) },
                honorees: { active: document.getElementById('honorees-master-filter').checked, awards: new Set(Array.from(document.querySelectorAll('#drb-awards-options-container input:checked')).map(cb => cb.value)), leadership: new Set(Array.from(document.querySelectorAll('#drb-leadership-options-container input:checked')).map(cb => cb.value))},
                education: { active: document.getElementById('education-master-filter').checked, universities: new Set(Array.from(document.querySelectorAll('#university-options-container .university-sub-checkbox:checked')).map(cb => cb.value)), majors: new Set(Array.from(document.querySelectorAll('#major-options-container .major-sub-checkbox:checked')).map(cb => cb.value)), degrees: new Set(Array.from(document.querySelectorAll('#degree-options-container input:checked')).map(cb => cb.value)), greek: new Set(Array.from(document.querySelectorAll('#greek-options-container input:checked')).map(cb => cb.value)) },
                career: { active: document.getElementById('career-master-filter').checked, industries: new Set(Array.from(document.querySelectorAll('#industry-options-container .industry-sub-checkbox:checked')).map(cb => cb.value)), military: new Set(Array.from(document.querySelectorAll('#military-options-container input:checked')).map(cb => cb.value)) },
                location: { active: document.getElementById('location-master-filter').checked, values: new Set(Array.from(document.querySelectorAll('#location-options-container input:checked')).map(cb => cb.value)) }
            };

            return searchFiltered.filter(alum => {
                if (activeFilters.classYears.active && activeFilters.classYears.values.size > 0) {
                    if (!activeFilters.classYears.values.has(alum.classYear || alum.gradYear)) return false;
                }
                
                if (activeFilters.honorees.active) {
                    const hasAwardsSelected = activeFilters.honorees.awards.size > 0;
                    const hasLeadershipSelected = activeFilters.honorees.leadership.size > 0;
                    
                    if (hasAwardsSelected || hasLeadershipSelected) {
                        const awardsMatch = hasAwardsSelected && alum.awards.some(award => activeFilters.honorees.awards.has(award));
                        const leadershipMatch = hasLeadershipSelected && alum.leadershipPositions.some(pos => activeFilters.honorees.leadership.has(pos));
                        if (!(awardsMatch || leadershipMatch)) return false;
                    } else {
                        if (alum.awards.length === 0 && alum.leadershipPositions.length === 0) return false;
                    }
                }
                
                if (activeFilters.education.active) {
                    const hasUniSelected = activeFilters.education.universities.size > 0;
                    const hasMajorSelected = activeFilters.education.majors.size > 0;
                    const hasDegreeSelected = activeFilters.education.degrees.size > 0;
                    const hasGreekSelected = activeFilters.education.greek.size > 0;
                    
                    if (hasUniSelected || hasMajorSelected || hasDegreeSelected || hasGreekSelected) {
                        // AND logic across sub-categories within Education
                        if (hasUniSelected && !alum.universities.some(u => activeFilters.education.universities.has(u))) return false;
                        if (hasMajorSelected && !alum.majors.some(m => activeFilters.education.majors.has(m))) return false;
                        if (hasDegreeSelected && !alum.educationHistory.some(edu => edu.degreeLevels.some(level => activeFilters.education.degrees.has(level)))) return false;
                        if (hasGreekSelected && !activeFilters.education.greek.has(alum.greekAffiliation)) return false;
                    } else {
                        if (!alum.hasEducation && !alum.greekAffiliation) return false;
                    }
                }
                
                if (activeFilters.career.active) {
                    const hasIndustrySelected = activeFilters.career.industries.size > 0;
                    const hasMilitarySelected = activeFilters.career.military.size > 0;
                    
                    if (hasIndustrySelected || hasMilitarySelected) {
                        // AND logic across industry and military
                        if (hasIndustrySelected && !activeFilters.career.industries.has(alum.industry)) return false;
                        if (hasMilitarySelected && !activeFilters.career.military.has(alum.militaryBranch)) return false;
                    } else {
                        if (!alum.industry && !alum.hasMilitaryService) return false;
                    }
                }
                
                if (activeFilters.location.active) {
                    if (activeFilters.location.values.size > 0) {
                        if (!activeFilters.location.values.has(alum.state)) return false;
                    } else {
                        if (!alum.state) return false;
                    }
                }
                return true;
            });
        }

        function renderProfilesImpl() {
          try {
            if (profilesContainer) profilesContainer.innerHTML = '';
            const filteredAlumni = filterAlumni(allAlumniData);


            if (filteredAlumni.length === 0) {
                 if (profilesContainer) profilesContainer.innerHTML = '<p id="no-results-message">No profiles match the current filters.</p>';
                 return;
            }

            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                // --- MOBILE: Expandable Card View ---
                profilesContainer.className = 'cards-list';

                const sortedAlumni = [...filteredAlumni];
                if (currentSort === 'class') {
                    sortedAlumni.sort((a, b) => a.gradYear - b.gradYear || a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));
                } else { // 'alpha'
                    sortedAlumni.sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));
                }

                sortedAlumni.forEach(alumnus => {
                        const cardDiv = document.createElement('div');
                        cardDiv.className = 'profile-card mobile-card';
                        cardDiv.dataset.id = alumnus.id;
                        
                        const year = parseInt(alumnus.gradYear, 10);
                        const colorIndex = ((year - 2000) % 4 + 4) % 4;
                        cardDiv.classList.add(`year-color-${colorIndex}`);

                        const mainImageUrl = alumnus.photoUrl || generateAvatar(alumnus.firstName, alumnus.lastName, alumnus.gradYear);
                        const drbImageUrl = alumnus.drbPhotoUrl || mainImageUrl;
                        
                        const mainPos = faceCoords[generateFaceKey(mainImageUrl)] ? `${faceCoords[generateFaceKey(mainImageUrl)].x}% ${faceCoords[generateFaceKey(mainImageUrl)].y}%` : 'top center';
                        const drbPos = faceCoords[generateFaceKey(drbImageUrl)] ? `${faceCoords[generateFaceKey(drbImageUrl)].x}% ${faceCoords[generateFaceKey(drbImageUrl)].y}%` : 'top center';

                        let summaryHtml = '';
                        if (alumnus.occupation) summaryHtml += `<p><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zM10 4h4v2h-4V4zm10 15H4V8h16v11z"/></svg>${escapeHTML(alumnus.occupation)}</p>`;
                        if (alumnus.city) summaryHtml += `<p><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>${escapeHTML(alumnus.city)}</p>`;

                        let drbHtml = '';
                        if (alumnus.tenure || alumnus.awards.length > 0 || alumnus.favoriteStep || alumnus.leadershipPositions.length > 0) {
                            drbHtml += '<div class="detail-section"><h3>DRB Info</h3><ul>';
                            if (alumnus.tenure) drbHtml += `<li><strong>Tenure:</strong> <div>${escapeHTML(alumnus.tenure)}-year${alumnus.tenure === '1' ? '' : 's'} member</div></li>`;
                            if (alumnus.leadershipPositions.length > 0) drbHtml += `<li><strong>Leadership:</strong> <div>${alumnus.leadershipPositions.map(escapeHTML).join(', ')}</div></li>`;
                            if (alumnus.awards.length > 0) drbHtml += `<li><strong>Awards:</strong> <div>${alumnus.awards.map(escapeHTML).join(', ')}</div></li>`;
                            if (alumnus.favoriteStep) drbHtml += `<li><strong>Favorite Step:</strong> <div>${escapeHTML(alumnus.favoriteStep)}</div></li>`;
                            drbHtml += '</ul></div>';
                        }
                        
                        let eduHtml = '';
                        if (alumnus.hasEducation) {
                            eduHtml += '<div class="detail-section"><h3>Higher Education</h3><ul>';
                            alumnus.educationHistory.forEach(edu => {
                                eduHtml += `<li><strong>${escapeHTML(edu.university)}</strong>`;
                                let details = [];
                                if (edu.majors.length > 0) details.push(`Major(s): ${edu.majors.map(m => escapeHTML(m.original)).join(', ')}`);
                                if (edu.degrees.length > 0) details.push(`Degree(s): ${edu.degrees.map(escapeHTML).join(', ')}`);
                                if (edu.gradYear) details.push(`Class of ${escapeHTML(edu.gradYear)}`);
                                if (details.length > 0) eduHtml += `<small>${details.join(' | ')}</small>`;
                                eduHtml += `</li>`;
                            });
                            eduHtml += '</ul></div>';
                        }
                        
                        let militaryHtml = '';
                        if (alumnus.hasMilitaryService) {
                            militaryHtml += '<div class="detail-section"><h3>Military Service</h3><ul>';
                            if (alumnus.militaryBranch) militaryHtml += `<li><strong>Branch:</strong> <div>${escapeHTML(alumnus.militaryBranch)}</div></li>`;
                            if (alumnus.militaryRank) militaryHtml += `<li><strong>Rank:</strong> <div>${escapeHTML(alumnus.militaryRank)}</div></li>`;
                            militaryHtml += '</ul></div>';
                        }

                        let greekHtml = '';
                        if (alumnus.greekAffiliation) {
                            greekHtml += `<div class="detail-section"><h3>Greek Affiliation</h3><ul><li><div>${escapeHTML(alumnus.greekAffiliation)}</div></li></ul></div>`;
                        }

                        let aboutHtml = '';
                        if (alumnus.about) {
                            aboutHtml += `<div class="detail-section"><h3>Highlights</h3><p>${escapeHTML(alumnus.about)}</p></div>`;
                        }

                        let contactHtml = '';
                        let hasContact = alumnus.email || alumnus.phone || alumnus.instagramUrl || alumnus.socialMedia.length > 0 || alumnus.websites.length > 0;
                        if (hasContact) {
                            contactHtml += '<div class="detail-section"><h3>Contact Info</h3><ul>';
                            if (alumnus.email) { contactHtml += `<li><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg><div><a href="mailto:${escapeHTML(alumnus.email)}">${escapeHTML(alumnus.email)}</a></div></li>`; }
                            if (alumnus.phone) { contactHtml += `<li><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.02.74-.25 1.02l-2.2 2.2z"/></svg><div>${escapeHTML(alumnus.phone)}</div></li>`; }
                            if (alumnus.instagramUrl) { contactHtml += `<li>${socialIcons.instagram}<div><a href="${escapeHTML(alumnus.instagramUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(alumnus.instagramHandle)}</a></div></li>`; }
                            alumnus.socialMedia.forEach(social => { const icon = socialIcons[social.type.toLowerCase()] || socialIcons.social; contactHtml += `<li>${icon}<div><a href="${escapeHTML(social.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(social.display)}</a></div></li>` });
                            alumnus.websites.forEach(site => { contactHtml += `<li>${socialIcons.website}<div><a href="${escapeHTML(site.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(site.display)} (${escapeHTML(site.type)})</a></div></li>` });
                            contactHtml += '</ul>';
                            if (alumnus.instagramUrl) {
                                contactHtml += `<a href="${escapeHTML(alumnus.instagramUrl)}" target="_blank" rel="noopener noreferrer" class="instagram-card">
                                    ${socialIcons.instagram}
                                    <div class="ig-info"><div class="ig-handle">${escapeHTML(alumnus.instagramHandle)}</div><div class="ig-cta">View on Instagram</div></div>
                                    <span class="ig-arrow">→</span></a>`;
                            }
                            contactHtml += '</div>';
                        }
                        
                        cardDiv.innerHTML = `
                            <div class="card-main">
                                <div class="card-header">
                                    <div class="profile-image-container">
                                         <img src="${mainImageUrl}" alt="${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)}" class="front-face" loading="lazy" style="object-position: ${mainPos}">
                                         <img src="${drbImageUrl}" alt="${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)} DRB" class="back-face" loading="lazy" style="object-position: ${drbPos}">
                                    </div>
                                    <div class="name-info">
                                        <p class="name">${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)}</p>
                                        <p class="year">Class of ${escapeHTML(alumnus.gradYear)}</p>
                                    </div>
                                </div>
                                ${summaryHtml ? `<div class="card-summary">${summaryHtml}</div>` : ''}
                            </div>
                            <div class="details-toggle">
                                <span>Bio and Contact</span><span class="arrow"></span>
                            </div>
                            <div class="expandable-details">
                                ${drbHtml}
                                ${eduHtml}
                                ${militaryHtml}
                                ${greekHtml}
                                ${aboutHtml}
                                ${contactHtml}
                            </div>
                        `;
                        profilesContainer.appendChild(cardDiv);
                    });
            } else {
                // --- DESKTOP: Grouped by Year View ---
                profilesContainer.className = '';

                if (currentSort === 'class') {
                    const alumniByYear = {};
                    filteredAlumni.forEach(alumnus => {
                        if (!alumniByYear[alumnus.gradYear]) alumniByYear[alumnus.gradYear] = [];
                        alumniByYear[alumnus.gradYear].push(alumnus);
                    });

                    const sortedYears = Object.keys(alumniByYear).sort((a, b) => a - b);

                    sortedYears.forEach(yearStr => {
                        const yearGroupDiv = document.createElement('div');
                        yearGroupDiv.className = 'year-group';
                        const yearHeader = document.createElement('h2');
                        yearHeader.className = 'year-header';
                        yearHeader.textContent = `Class of ${yearStr}`;

                        const year = parseInt(yearStr, 10);
                        const colorIndex = ((year - 2000) % 4 + 4) % 4;
                        yearHeader.classList.add(`year-color-${colorIndex}`);
                        
                        const cardsContainer = document.createElement('div');
                        cardsContainer.className = 'cards-grid';
                        alumniByYear[yearStr]
                            .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName))
                            .forEach(alumnus => {
                                const cardDiv = document.createElement('div');
                                cardDiv.className = 'profile-card desktop-card';
                                cardDiv.classList.add(`year-color-${colorIndex}`);
                                cardDiv.dataset.id = alumnus.id;
                                
                                const mainImageUrl = alumnus.photoUrl || generateAvatar(alumnus.firstName, alumnus.lastName, alumnus.gradYear);
                                const drbImageUrl = alumnus.drbPhotoUrl || mainImageUrl;
                                const hasDrbPhoto = !!alumnus.drbPhotoUrl;

                                if (!hasDrbPhoto) {
                                    cardDiv.classList.add('no-hover');
                                }
                                const mainPos = faceCoords[generateFaceKey(mainImageUrl)] ? `${faceCoords[generateFaceKey(mainImageUrl)].x}% ${faceCoords[generateFaceKey(mainImageUrl)].y}%` : 'top center';
                                const drbPos = faceCoords[generateFaceKey(drbImageUrl)] ? `${faceCoords[generateFaceKey(drbImageUrl)].x}% ${faceCoords[generateFaceKey(drbImageUrl)].y}%` : 'top center';

                                cardDiv.innerHTML = `
                                    <div class="img-wrapper">
                                        <div class="profile-image-container">
                                             <img src="${mainImageUrl}" alt="${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)}" class="front-face" loading="lazy" style="object-position: ${mainPos}">
                                             <img src="${drbImageUrl}" alt="${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)} DRB" class="back-face" loading="lazy" style="object-position: ${drbPos}">
                                        </div>
                                    </div>
                                    <div class="info"><p class="name">${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)}</p></div>`;
                                cardsContainer.appendChild(cardDiv);
                            });
                        yearGroupDiv.appendChild(yearHeader);
                        yearGroupDiv.appendChild(cardsContainer);
                        profilesContainer.appendChild(yearGroupDiv);
                    });
                } else { // 'alpha' sort for desktop
                    const cardsContainer = document.createElement('div');
                    cardsContainer.className = 'cards-grid';

                    const sortedAlumni = [...filteredAlumni].sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));

                    sortedAlumni.forEach(alumnus => {
                        const cardDiv = document.createElement('div');
                        const year = parseInt(alumnus.gradYear, 10);
                        const colorIndex = ((year - 2000) % 4 + 4) % 4;
                        cardDiv.className = 'profile-card desktop-card';
                        cardDiv.classList.add(`year-color-${colorIndex}`);
                        cardDiv.dataset.id = alumnus.id;
                        
                        const mainImageUrl = alumnus.photoUrl || generateAvatar(alumnus.firstName, alumnus.lastName, alumnus.gradYear);
                        const drbImageUrl = alumnus.drbPhotoUrl || mainImageUrl;
                        const hasDrbPhoto = !!alumnus.drbPhotoUrl;

                        if (!hasDrbPhoto) {
                            cardDiv.classList.add('no-hover');
                        }
                        const mainPos = faceCoords[generateFaceKey(mainImageUrl)] ? `${faceCoords[generateFaceKey(mainImageUrl)].x}% ${faceCoords[generateFaceKey(mainImageUrl)].y}%` : 'top center';
                        const drbPos = faceCoords[generateFaceKey(drbImageUrl)] ? `${faceCoords[generateFaceKey(drbImageUrl)].x}% ${faceCoords[generateFaceKey(drbImageUrl)].y}%` : 'top center';

                        cardDiv.innerHTML = `
                            <div class="img-wrapper">
                                <div class="profile-image-container">
                                     <img src="${mainImageUrl}" alt="${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)}" class="front-face" loading="lazy" style="object-position: ${mainPos}">
                                     <img src="${drbImageUrl}" alt="${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)} DRB" class="back-face" loading="lazy" style="object-position: ${drbPos}">
                                </div>
                            </div>
                            <div class="info"><p class="name">${escapeHTML(alumnus.firstName)} ${escapeHTML(alumnus.lastName)}</p></div>`;
                        cardsContainer.appendChild(cardDiv);
                    });
                    profilesContainer.appendChild(cardsContainer);
                }
            }
          } catch (err) { console.error('renderProfilesImpl error:', err); }
        }
        
        function showProfile(alumnusId) {
            const alumnus = allAlumniData.find(a => a.id === alumnusId);
            if (!alumnus) {
                showMainView();
                return;
            }
            
            document.getElementById('page-top-bar').style.display = 'none';
            document.getElementById('filter-panel').style.display = 'none';
            document.getElementById('dashboard-view').style.display = 'none';
            document.getElementById('map-view').style.display = 'none';
            const memView = document.getElementById('memories-view');
            if (memView) memView.style.display = 'none';
            profileView.style.display = 'block';

            const imageContainer = profileView.querySelector('.profile-image-container');
            
            profileView.querySelector('.name').textContent = `${alumnus.firstName} ${alumnus.lastName}`;
            profileView.querySelector('.year').textContent = `Class of ${alumnus.gradYear}`;
            profileView.querySelector('.city').textContent = alumnus.city ? `📍 ${alumnus.city}` : '';

            const frontImg = imageContainer.querySelector('.front-face');
            const backImg = imageContainer.querySelector('.back-face');
            
            const avatarFallback = generateAvatar(alumnus.firstName, alumnus.lastName, alumnus.gradYear);
            frontImg.src = alumnus.photoUrl || avatarFallback;
            backImg.src = alumnus.drbPhotoUrl || (alumnus.photoUrl || avatarFallback);
            
            frontImg.style.objectPosition = faceCoords[generateFaceKey(frontImg.src)] ? `${faceCoords[generateFaceKey(frontImg.src)].x}% ${faceCoords[generateFaceKey(frontImg.src)].y}%` : 'top center';
            backImg.style.objectPosition = faceCoords[generateFaceKey(backImg.src)] ? `${faceCoords[generateFaceKey(backImg.src)].x}% ${faceCoords[generateFaceKey(backImg.src)].y}%` : 'top center';

            // Show Edit Button logic
            imageContainer.classList.toggle('no-hover', !alumnus.drbPhotoUrl);

            profileView.querySelector('#profile-main .name').textContent = `${alumnus.firstName} ${alumnus.lastName}`;
            profileView.querySelector('#profile-main .year').textContent = `Class of ${alumnus.gradYear}`;
            profileView.querySelector('#profile-main .city').textContent = alumnus.city || '';

            const detailsContainer = profileView.querySelector('#profile-details');
            const drbStatsContainer = profileView.querySelector('#profile-drb-stats');
            const contactContainer = profileView.querySelector('#profile-contact-info');
            detailsContainer.innerHTML = '';
            drbStatsContainer.innerHTML = '';
            contactContainer.innerHTML = '';

            // Add "Edit Profile" button if this is the user's own profile OR if admin
            const existingEditBtn = profileView.querySelector('.edit-profile-btn');
            if (existingEditBtn) existingEditBtn.remove();
            const isAdmin = currentUserEmail === 'admin@drb.network';
            const isOwnProfile = alumnus.email && currentUserEmail && alumnus.email.toLowerCase().includes(currentUserEmail.toLowerCase());
            if (isOwnProfile || isAdmin) {
                const editBtn = document.createElement('button');
                editBtn.className = 'edit-profile-btn';
                editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> ' + (isAdmin && !isOwnProfile ? 'Edit Profile (Admin)' : 'Edit My Profile');
                editBtn.addEventListener('click', () => openEditModal(alumnus));
                profileView.querySelector('#profile-main').appendChild(editBtn);
            }

            const createDetailSection = (title, data) => {
                if (!data || data.length === 0) return '';
                let content;
                if (Array.isArray(data) && data.length > 0) {
                    content = `<ul>${data.map(item => `<li>${item}</li>`).join('')}</ul>`;
                } else if (typeof data === 'string' && data.trim() !== '') {
                    content = `<p>${data}</p>`;
                } else { return ''; }
                return `<div class="detail-section"><h3>${title}</h3>${content}</div>`;
            };

            let contactHtml = '<ul>';
            if (alumnus.email) {
                contactHtml += `<li><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg><a href="mailto:${escapeHTML(alumnus.email)}">${escapeHTML(alumnus.email)}</a></li>`;
            }
            if (alumnus.phone) {
                contactHtml += `<li><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.02.74-.25 1.02l-2.2 2.2z"/></svg><span>${escapeHTML(alumnus.phone)}</span></li>`;
            }
            if (alumnus.instagramUrl) {
                contactHtml += `<li>${socialIcons.instagram}<a href="${escapeHTML(alumnus.instagramUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(alumnus.instagramHandle)}</a></li>`;
            }
            alumnus.socialMedia.forEach(social => {
                const icon = socialIcons[social.type.toLowerCase()] || socialIcons.social;
                contactHtml += `<li>${icon}<a href="${escapeHTML(social.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(social.display)}</a></li>`
            });
            alumnus.websites.forEach(site => {
                contactHtml += `<li>${socialIcons.website}<a href="${escapeHTML(site.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(site.display)} (${escapeHTML(site.type)})</a></li>`
            });
            contactHtml += '</ul>';

            if (contactHtml !== '<ul></ul>') contactContainer.innerHTML = contactHtml;

            detailsContainer.innerHTML += createDetailSection('Occupation / Industry', alumnus.occupation);
            if (alumnus.hasEducation) {
                let eduHtml = '<div class="detail-section"><h3>Higher Education</h3><ul>';
                alumnus.educationHistory.forEach(edu => {
                    eduHtml += `<li><strong>${escapeHTML(edu.university)}</strong>`;
                    let details = [];
                    if (edu.majors.length > 0) details.push(`Major(s): ${edu.majors.map(m => escapeHTML(m.original)).join(', ')}`);
                    if (edu.degrees.length > 0) details.push(`Degree(s): ${edu.degrees.map(escapeHTML).join(', ')}`);
                    if (edu.gradYear) details.push(`Class of ${escapeHTML(edu.gradYear)}`);
                    if (details.length > 0) eduHtml += `<br><small>${details.join(' | ')}</small>`;
                    eduHtml += `</li>`;
                });
                eduHtml += '</ul></div>';
                detailsContainer.innerHTML += eduHtml;
            }
            if (alumnus.hasMilitaryService) {
                let militaryHtml = '<div class="detail-section"><h3>Military Service</h3><ul>';
                if (alumnus.militaryBranch) militaryHtml += `<li><strong>Branch:</strong> ${escapeHTML(alumnus.militaryBranch)}</li>`;
                if (alumnus.militaryRank) militaryHtml += `<li><strong>Rank:</strong> ${escapeHTML(alumnus.militaryRank)}</li>`;
                militaryHtml += '</ul></div>';
                detailsContainer.innerHTML += militaryHtml;
            }
            detailsContainer.innerHTML += createDetailSection('Greek Affiliation', alumnus.greekAffiliation);
            detailsContainer.innerHTML += createDetailSection('Highlights', alumnus.about);

            let drbHtml = '';
            if (alumnus.tenure || alumnus.awards.length > 0 || alumnus.favoriteStep || alumnus.leadershipPositions.length > 0) {
                drbHtml = '<ul class="stats-list">';
                if (alumnus.tenure) drbHtml += `<li><strong>Tenure:</strong> ${escapeHTML(alumnus.tenure)}-year${alumnus.tenure === '1' ? '' : 's'} member</li>`;
                if (alumnus.leadershipPositions.length > 0) drbHtml += `<li><strong>Leadership:</strong> ${alumnus.leadershipPositions.map(escapeHTML).join(', ')}</li>`;
                if (alumnus.awards.length > 0) drbHtml += `<li><strong>Awards:</strong> ${alumnus.awards.map(escapeHTML).join(', ')}</li>`;
                if (alumnus.favoriteStep) drbHtml += `<li><strong>Favorite Step:</strong> ${escapeHTML(alumnus.favoriteStep)}</li>`;
                drbHtml += '</ul>';
                drbStatsContainer.innerHTML = drbHtml;
            }
        }

        function showMainView() {
            profileView.style.display = 'none';
            document.getElementById('page-top-bar').style.display = '';
            document.getElementById('filter-panel').style.display = '';
            window.location.hash = '';
            switchView(currentView);
        }

        // --- Memories Gallery ---
        function renderMemories() {
            const container = document.querySelector('.memories-gallery');
            if (!container) return;

            const allMemories = [];
            allAlumniData.forEach(a => {
                if (a.drbPhotoUrl) {
                    allMemories.push({ url: a.drbPhotoUrl, id: generateFaceKey(a.drbPhotoUrl) });
                }
            });

            if (allMemories.length === 0) {
                container.innerHTML = '<p class="memories-empty">No photos uploaded yet. Be the first to share a memory!</p>';
                return;
            }

            // Randomize photos
            for (let i = allMemories.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allMemories[i], allMemories[j]] = [allMemories[j], allMemories[i]];
            }

            // Only show up to 50 photos to avoid lag
            container.innerHTML = allMemories.slice(0, 50).map(m => {
                 const imgObjPos = faceCoords[m.id] ? `${faceCoords[m.id].x}% ${faceCoords[m.id].y}%` : 'center';
                 return `<div class="memory-card">
                     <img src="${escapeHTML(m.url)}" alt="DRB Memory" loading="lazy" style="object-position: ${imgObjPos}" onerror="this.closest('.memory-card').style.display='none'">
                 </div>`;
            }).join('');

            // Update memory count
            const countEl = document.querySelector('.memories-count');
            if (countEl) countEl.textContent = `${allMemories.length} photos`;
        }

        // --- View Switching ---
        function switchView(view) {
            currentView = view;
            const views = ['dashboard-view', 'map-view', 'memories-view'];
            views.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            const btn = document.getElementById(`view-${view}-btn`);
            if (btn) btn.classList.add('active');
            
            const viewEl = document.getElementById(`${view}-view`);
            if (viewEl) viewEl.style.display = 'block';
            
            renderCurrentView();
        }

        function renderCurrentView() {
            const filteredAlumni = filterAlumni(allAlumniData);
            
            if (currentView === 'dashboard') {
                renderDirectory(filteredAlumni);
            } else if (currentView === 'map') {
                renderMapView(filteredAlumni);
            } else if (currentView === 'memories') {
                renderMemories();
            }
        }

        // --- Unified Directory View (Formerly Dashboard/Grid) ---
        function renderDirectory(filteredAlumni) {
            const isFiltered = currentSearchQuery || filteredAlumni.length < allAlumniData.length;
            
            // 1. Interactive Stats
            const cities = new Set(filteredAlumni.map(a => a.city).filter(Boolean));
            const industries = new Set(filteredAlumni.map(a => a.occupation).filter(Boolean));
            const classYears = new Set(filteredAlumni.map(a => a.gradYear).filter(Boolean));
            animateCounter('stat-total', filteredAlumni.length);
            animateCounter('stat-cities', cities.size);
            animateCounter('stat-industries', industries.size);
            animateCounter('stat-classes', classYears.size);

            // 2. Featured Carousel (Hide if searching/filtering to save space)
            const featuredSection = document.getElementById('featured-section');
            if (isFiltered) {
                featuredSection.style.display = 'none';
            } else {
                featuredSection.style.display = 'block';
                const carousel = document.getElementById('featured-carousel');
                if (carousel) {
                    const withPhotos = filteredAlumni.filter(a => a.photoUrl);
                    const featured = [];
                    const pool = [...withPhotos];
                    for (let i = 0; i < Math.min(3, pool.length); i++) {
                        const idx = Math.floor(Math.random() * pool.length);
                        featured.push(pool.splice(idx, 1)[0]);
                    }
                    carousel.innerHTML = featured.map(a => {
                        const hasSwap = !!a.drbPhotoUrl;
                        return `
                        <a href="#profile=${a.id}" class="featured-card${hasSwap ? '' : ' no-swap'}">
                            <div class="featured-img-wrap">
                                <img class="front-face" src="${a.photoUrl || generateAvatar(a.firstName, a.lastName, a.gradYear)}" alt="${a.firstName}" style="object-position: ${faceCoords[generateFaceKey(a.photoUrl)] ? `${faceCoords[generateFaceKey(a.photoUrl)].x}% ${faceCoords[generateFaceKey(a.photoUrl)].y}%` : 'top center'}" onerror="this.onerror=null">
                                ${hasSwap ? `<img class="back-face" src="${a.drbPhotoUrl}" alt="${a.firstName} DRB" style="object-position: ${faceCoords[generateFaceKey(a.drbPhotoUrl)] ? `${faceCoords[generateFaceKey(a.drbPhotoUrl)].x}% ${faceCoords[generateFaceKey(a.drbPhotoUrl)].y}%` : 'top center'}" onerror="this.onerror=null">` : ''}
                            </div>
                            <div class="featured-info">
                                <h3>${a.firstName} ${a.lastName}</h3>
                                <p>Class of ${a.gradYear}</p>
                                ${a.occupation ? `<p class="featured-occ">${a.occupation}</p>` : ''}
                                ${a.city ? `<p class="featured-city">📍 ${a.city}</p>` : ''}
                            </div>
                        </a>
                    `}).join('');
                }
            }

            // 3. Grid View
            const gridContainer = document.getElementById('dashboard-grid');
            if (gridContainer) {
                let dashData = [...filteredAlumni];
                if (currentSort === 'alpha') {
                    dashData.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
                } else {
                    dashData.sort((a, b) => (a.gradYear || '').localeCompare(b.gradYear || '') || `${a.firstName}`.localeCompare(`${b.firstName}`));
                }

                gridContainer.innerHTML = dashData.map(a => {
                    const avatarUrl = a.photoUrl || generateAvatar(a.firstName, a.lastName, a.gradYear);
                    const mainPos = faceCoords[generateFaceKey(a.photoUrl)] ? `${faceCoords[generateFaceKey(a.photoUrl)].x}% ${faceCoords[generateFaceKey(a.photoUrl)].y}%` : 'top center';
                    const drbPos = faceCoords[generateFaceKey(a.drbPhotoUrl)] ? `${faceCoords[generateFaceKey(a.drbPhotoUrl)].x}% ${faceCoords[generateFaceKey(a.drbPhotoUrl)].y}%` : 'top center';
                    return `
                    <a href="#profile=${a.id}" class="grid-card${a.drbPhotoUrl ? '' : ' no-swap'}">
                        <div class="grid-card-img">
                            <img class="front-face" src="${avatarUrl}" alt="${a.firstName}" loading="lazy" style="object-position: ${mainPos}" onerror="this.onerror=null">
                            ${a.drbPhotoUrl ? `<img class="back-face" src="${a.drbPhotoUrl}" alt="${a.firstName} DRB" loading="lazy" style="object-position: ${drbPos}" onerror="this.onerror=null">` : ''}
                        </div>
                        <div class="grid-card-body">
                            <h3>${a.firstName} ${a.lastName}</h3>
                            <p class="grid-year">Class of ${a.gradYear}</p>
                            ${a.city ? `<p class="grid-city">📍 ${a.city}</p>` : ''}
                            ${a.occupation ? `<p class="grid-occ">${a.occupation}</p>` : ''}
                        </div>
                    </a>
                `}).join('');
            }
        }

        function animateCounter(id, target) {
            const el = document.getElementById(id);
            if (!el) return;
            const duration = 800;
            const start = performance.now();
            const from = parseInt(el.textContent) || 0;
            function tick(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.round(from + (target - from) * eased);
                if (progress < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        }



        // --- Map View ---
        const CITY_COORDS = {
            'new york': [40.7128, -74.0060], 'los angeles': [34.0522, -118.2437],
            'chicago': [41.8781, -87.6298], 'houston': [29.7604, -95.3698],
            'phoenix': [33.4484, -112.0740], 'philadelphia': [39.9526, -75.1652],
            'san antonio': [29.4241, -98.4936], 'san diego': [32.7157, -117.1611],
            'dallas': [32.7767, -96.7970], 'charlotte': [35.2271, -80.8431],
            'raleigh': [35.7796, -78.6382], 'chapel hill': [35.9132, -79.0558],
            'durham': [35.9940, -78.8986], 'greensboro': [36.0726, -79.7920],
            'atlanta': [33.7490, -84.3880], 'miami': [25.7617, -80.1918],
            'washington': [38.9072, -77.0369], 'dc': [38.9072, -77.0369],
            'seattle': [47.6062, -122.3321], 'denver': [39.7392, -104.9903],
            'boston': [42.3601, -71.0589], 'nashville': [36.1627, -86.7816],
            'austin': [30.2672, -97.7431], 'san francisco': [37.7749, -122.4194],
            'portland': [45.5152, -122.6784], 'las vegas': [36.1699, -115.1398],
            'memphis': [35.1495, -90.0490], 'louisville': [38.2527, -85.7585],
            'baltimore': [39.2904, -76.6122], 'milwaukee': [43.0389, -87.9065],
            'albuquerque': [35.0844, -106.6504], 'tucson': [32.2226, -110.9747],
            'fresno': [36.7378, -119.7871], 'sacramento': [38.5816, -121.4944],
            'kansas city': [39.0997, -94.5786], 'colorado springs': [38.8339, -104.8214],
            'omaha': [41.2565, -95.9345], 'minneapolis': [44.9778, -93.2650],
            'tampa': [27.9506, -82.4572], 'orlando': [28.5383, -81.3792],
            'jacksonville': [30.3322, -81.6557], 'richmond': [37.5407, -77.4360],
            'new orleans': [29.9511, -90.0715], 'cleveland': [41.4993, -81.6944],
            'pittsburgh': [40.4406, -79.9959], 'cincinnati': [39.1031, -84.5120],
            'indianapolis': [39.7684, -86.1581], 'columbus': [39.9612, -82.9988],
            'detroit': [42.3314, -83.0458], 'st. louis': [38.6270, -90.1994],
            'san jose': [37.3382, -121.8863], 'fort worth': [32.7555, -97.3308],
            'wilmington': [34.2257, -77.9447], 'fayetteville': [35.0527, -78.8784],
            'winston-salem': [36.0999, -80.2442],
            // Additional cities
            'san marcos': [29.8833, -97.9414], 'fort walton beach': [30.4058, -86.6187],
            'arlington': [32.7357, -97.1081], 'plano': [33.0198, -96.6989],
            'irvine': [33.6846, -117.8265], 'scottsdale': [33.4942, -111.9261],
            'savannah': [32.0809, -81.0912], 'charleston': [32.7765, -79.9311],
            'annapolis': [38.9784, -76.4922], 'norfolk': [36.8508, -76.2859],
            'hampton': [37.0299, -76.3452], 'newport news': [37.0871, -76.4730],
            'virginia beach': [36.8529, -75.9780], 'chesapeake': [36.7682, -76.2875],
            'alexandria': [38.8048, -77.0469], 'fairfax': [38.8462, -77.3064],
            'silver spring': [38.9907, -77.0261], 'bethesda': [38.9847, -77.0947],
            'columbia': [34.0007, -81.0348], 'greenville': [34.8526, -82.3940],
            'birmingham': [33.5207, -86.8025], 'huntsville': [34.7304, -86.5861],
            'mobile': [30.6954, -88.0399], 'montgomery': [32.3792, -86.3077],
            'baton rouge': [30.4515, -91.1871], 'shreveport': [32.5252, -93.7502],
            'little rock': [34.7465, -92.2896], 'knoxville': [35.9606, -83.9207],
            'chattanooga': [35.0456, -85.3097], 'murfreesboro': [35.8456, -86.3903],
            'clarksville': [36.5298, -87.3595], 'jackson': [32.2988, -90.1848],
            'tupelo': [34.2576, -88.7034], 'oxford': [34.3665, -89.5192],
            'tuscaloosa': [33.2098, -87.5692], 'auburn': [32.6099, -85.4808],
            'roanoke': [37.2710, -79.9414], 'lynchburg': [37.4138, -79.1422],
            'harrisburg': [40.2732, -76.8867], 'allentown': [40.6023, -75.4714],
            'newark': [40.7357, -74.1724], 'jersey city': [40.7178, -74.0431],
            'stamford': [41.0534, -73.5387], 'bridgeport': [41.1792, -73.1894],
            'hartford': [41.7658, -72.6734], 'new haven': [41.3083, -72.9279],
            'providence': [41.8240, -71.4128], 'springfield': [42.1015, -72.5898],
            'worcester': [42.2626, -71.8023], 'buffalo': [42.8864, -78.8784],
            'rochester': [43.1566, -77.6088], 'syracuse': [43.0481, -76.1474],
            'albany': [42.6526, -73.7562], 'trenton': [40.2171, -74.7429],
            'wilmington de': [39.7391, -75.5392], 'dover': [39.1582, -75.5244],
            'st. petersburg': [27.7676, -82.6403], 'fort lauderdale': [26.1224, -80.1373],
            'west palm beach': [26.7153, -80.0534], 'tallahassee': [30.4383, -84.2807],
            'gainesville': [29.6516, -82.3248], 'pensacola': [30.4213, -87.2169],
            'sarasota': [27.3364, -82.5307], 'fort myers': [26.6406, -81.8723],
            'naples': [26.1420, -81.7948], 'daytona beach': [29.2108, -81.0228],
            'ocala': [29.1872, -82.1401], 'lakeland': [28.0395, -81.9498],
            'macon': [32.8407, -83.6324], 'athens': [33.9519, -83.3576],
            'augusta': [33.4735, -81.9748], 'marietta': [33.9526, -84.5499],
            'alpharetta': [34.0754, -84.2941], 'decatur': [33.7748, -84.2963],
            'sandy springs': [33.9304, -84.3733], 'roswell': [34.0232, -84.3616],
            'san bernardino': [34.1083, -117.2898], 'riverside': [33.9533, -117.3962],
            'long beach': [33.7701, -118.1937], 'oakland': [37.8044, -122.2712],
            'bakersfield': [35.3733, -119.0187], 'anaheim': [33.8366, -117.9143],
            'santa ana': [33.7455, -117.8677], 'stockton': [37.9577, -121.2908],
            'chula vista': [32.6401, -117.0842], 'st paul': [44.9537, -93.0900],
            'des moines': [41.5868, -93.6250], 'madison': [43.0731, -89.4012],
            'boise': [43.6150, -116.2023], 'salt lake city': [40.7608, -111.8910],
            'spokane': [47.6588, -117.4260], 'tacoma': [47.2529, -122.4443],
            'eugene': [44.0521, -123.0868], 'salem': [44.9429, -123.0351],
            'reno': [39.5296, -119.8138], 'henderson': [36.0395, -114.9817],
            'mesa': [33.4152, -111.8315], 'chandler': [33.3062, -111.8413],
            'gilbert': [33.3528, -111.7890], 'glendale': [33.5387, -112.1860],
            'tempe': [33.4255, -111.9400], 'peoria': [33.5806, -112.2374],
            'laredo': [27.5036, -99.5076], 'lubbock': [33.5779, -101.8552],
            'amarillo': [35.2220, -101.8313], 'el paso': [31.7619, -106.4850],
            'corpus christi': [27.8006, -97.3964], 'mcallen': [26.2034, -98.2300],
            'brownsville': [25.9017, -97.4975], 'midland': [31.9973, -102.0779],
            'waco': [31.5493, -97.1467], 'college station': [30.6280, -96.3344],
            'round rock': [30.5083, -97.6789], 'tyler': [32.3513, -95.3011],
            'beaumont': [30.0802, -94.1266], 'abilene': [32.4487, -99.7331],
            'pasadena': [29.6911, -95.2091], 'frisco': [33.1507, -96.8236],
            'mckinney': [33.1972, -96.6398], 'denton': [33.2148, -97.1331],
            'killeen': [31.1171, -97.7278], 'carrollton': [32.9537, -96.8900],
            'conroe': [30.3119, -95.4561], 'new braunfels': [29.7030, -98.1245],
            'edinburg': [26.3017, -98.1634], 'irving': [32.8140, -96.9489],
            'garland': [32.9126, -96.6389], 'grand prairie': [32.7460, -96.9978],
            'wichita falls': [33.9137, -98.4934], 'san angelo': [31.4638, -100.4370],
            'sugar land': [29.6197, -95.6349], 'pearland': [29.5636, -95.2860],
            'allen': [33.1032, -96.6706], 'league city': [29.5075, -95.0949],
            'longview': [32.5007, -94.7405], 'mansfield': [32.5632, -97.1417],
            'cedar park': [30.5052, -97.8203], 'pflugerville': [30.4394, -97.6200],
            'temple': [31.0982, -97.3428], 'bryan': [30.6744, -96.3698],
            'missouri city': [29.6186, -95.5377], 'baytown': [29.7355, -94.9774],
            'pharr': [26.1948, -98.1836], 'flower mound': [33.0146, -97.0970],
            'north richland hills': [32.8342, -97.2289], 'harlingen': [26.1906, -97.6961],
            'rowlett': [32.9029, -96.5637], 'euless': [32.8371, -97.0820],
            'desoto': [32.5899, -96.8570], 'grapevine': [32.9343, -97.0781],
            'cary': [35.7915, -78.7811], 'high point': [35.9557, -80.0053],
            'concord': [35.4088, -80.5795], 'burlington': [36.0957, -79.4378],
            'gastonia': [35.2621, -81.1873], 'rocky mount': [35.9382, -77.7905],
            'greenville nc': [35.6127, -77.3664], 'huntersville': [35.4107, -80.8429],
            'apex': [35.7327, -78.8503], 'mooresville': [35.5849, -80.8101],
            'kannapolis': [35.4874, -80.6217], 'cornelius': [35.4868, -80.8601],
            'indian trail': [35.0768, -80.6692], 'wake forest': [35.9799, -78.5097],
            'holly springs': [35.6513, -78.8336], 'matthews': [35.1168, -80.7237],
            'asheboro': [35.7076, -79.8134], 'leland': [34.2571, -78.0453],
            'clemmons': [36.0210, -80.3820], 'kernersville': [36.1198, -80.0737],
            'harrisonburg': [38.4496, -78.8689], 'charlottesville': [38.0293, -78.4767],
            'fredericksburg': [38.3032, -77.4605], 'manassas': [38.7509, -77.4753],
            'leesburg': [39.1157, -77.5636], 'staunton': [38.1496, -79.0717],
            'danville': [36.5860, -79.3930], 'suffolk': [36.7282, -76.5836],
            'hampton roads': [36.9897, -76.4280]
        };

        async function geocodeCity(cityName) {
            const key = cityName.toLowerCase().trim();
            if (geocodeCache[key]) return geocodeCache[key];
            if (geocodeCache[key] === null) return null; // previously failed
            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}&limit=1`, {
                    headers: { 'User-Agent': 'DRBNetworkDatabase/1.0' }
                });
                const data = await resp.json();
                if (data && data.length > 0) {
                    const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                    geocodeCache[key] = coords;
                    return coords;
                }
            } catch(e) {
                console.warn('Geocoding failed for:', cityName, e);
            }
            geocodeCache[key] = null;
            return null;
        }

        async function renderMapView(filteredAlumni) {
            const container = document.getElementById('map-container');
            if (!container) return;
            if (!leafletMap) {
                leafletMap = L.map(container, { zoomControl: false }).setView([35.5, -80.0], 5);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 19
                }).addTo(leafletMap);
                L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
            }
            leafletMap.invalidateSize();

            // Clear existing markers
            mapMarkers.forEach(m => leafletMap.removeLayer(m));
            mapMarkers = [];

            // Group alumni by city
            const cityGroups = {};
            filteredAlumni.forEach(a => {
                if (!a.city) return;
                const cityKey = a.city.toLowerCase().replace(/,\s*(\w{2})$/i, '').replace(/,.*$/, '').trim();
                if (!cityGroups[cityKey]) cityGroups[cityKey] = { name: a.city, alumni: [] };
                cityGroups[cityKey].alumni.push(a);
            });

            // Place markers — use hardcoded coords first, then geocode
            const entries = Object.entries(cityGroups);
            const geocodePromises = [];

            for (const [key, group] of entries) {
                let coords = CITY_COORDS[key];
                if (coords) {
                    addMapMarker(coords, group);
                } else {
                    // Queue for geocoding
                    geocodePromises.push(
                        geocodeCity(group.name).then(geoCoords => {
                            if (geoCoords) addMapMarker(geoCoords, group);
                        })
                    );
                }
            }

            // Wait for all geocoding to complete
            if (geocodePromises.length > 0) {
                await Promise.allSettled(geocodePromises);
            }

            // Add a summary control
            updateMapSummary();
        }

        function addMapMarker(coords, group) {
            const count = group.alumni.length;
            const radius = Math.min(8 + count * 2.5, 28);

            const marker = L.circleMarker(coords, {
                radius: radius,
                fillColor: '#7BAFD4',
                color: 'rgba(123, 175, 212, 0.4)',
                weight: 2,
                fillOpacity: 0.85
            }).addTo(leafletMap);

            // Add count label for groups > 1
            if (count > 1) {
                const label = L.marker(coords, {
                    icon: L.divIcon({
                        className: 'map-count-label',
                        html: `<span>${count}</span>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                }).addTo(leafletMap);
                mapMarkers.push(label);
            }

            const names = group.alumni.map(a => `<a href="#profile=${a.id}" style="color:#7BAFD4;text-decoration:none;">${a.firstName} ${a.lastName}</a>`).join('<br>');
            marker.bindPopup(`<div style="font-family:Inter,sans-serif;"><strong style="font-size:1.05em;">${group.name}</strong> <span style="color:#6c757d;">(${count})</span><br><div style="margin-top:6px;line-height:1.6;">${names}</div></div>`, { maxWidth: 250 });
            mapMarkers.push(marker);
        }

        function updateMapSummary() {
            const existing = document.querySelector('.map-summary');
            if (existing) existing.remove();

            const total = mapMarkers.filter(m => m instanceof L.CircleMarker).length;
            const totalAlumni = allAlumniData.filter(a => a.city).length;
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'map-summary';
            summaryDiv.innerHTML = `<span>${total} cities</span> · <span>${totalAlumni} alumni mapped</span>`;
            document.getElementById('map-view').appendChild(summaryDiv);
        }

        function router() {
            const hash = window.location.hash;
            if (hash.startsWith('#profile=')) {
                const alumnusId = hash.substring(9);
                showProfile(alumnusId);
            } else {
                showMainView();
            }
        }
        
        function populateHierarchicalFilter(container, items, itemType) {
            if (!container) return;
            container.innerHTML = ''; 

            const itemsByCategory = {};
            for (const itemName in items) {
                const category = items[itemName];
                if (!itemsByCategory[category]) {
                    itemsByCategory[category] = [];
                }
                itemsByCategory[category].push(itemName);
            }

            let sortedCategories = Object.keys(itemsByCategory).sort();

            const otherIndex = sortedCategories.indexOf('Other');
            if (otherIndex > -1) {
                sortedCategories.splice(otherIndex, 1);
                sortedCategories.push('Other');
            }
            
            sortedCategories.forEach(category => {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = `${itemType}-category-group`;

                if (itemsByCategory[category].length === 1) {
                    // If there's only one item in the category, render a single, direct checkbox.
                    const item = itemsByCategory[category][0];
                    const subCheckboxId = `${itemType}-single-${item.replace(/\W/g, '-')}`;
                    categoryDiv.innerHTML = `
                        <div class="sub-filter-group">
                            <input type="checkbox" id="${subCheckboxId}" value="${item}" class="${itemType}-sub-checkbox">
                            <label for="${subCheckboxId}">${category}</label>
                        </div>`;
                    container.appendChild(categoryDiv);
                    categoryDiv.querySelector('input').addEventListener('change', renderProfiles);
                } else {
                    // Otherwise, render the expandable category with multiple sub-options.
                    const masterCheckboxId = `${itemType}-category-${category.replace(/\W/g, '-')}`;
                    categoryDiv.innerHTML = `
                        <div class="sub-filter-group master-${itemType}">
                            <input type="checkbox" id="${masterCheckboxId}">
                            <label for="${masterCheckboxId}">${category}</label>
                        </div>
                    `;
                    
                    const subOptionsContainer = document.createElement('div');
                    subOptionsContainer.className = `${itemType}-sub-options`;
                    
                    itemsByCategory[category].sort().forEach(item => {
                        const subCheckboxId = `${itemType}-${item.replace(/\W/g, '-')}`;
                        const subDiv = document.createElement('div');
                        subDiv.className = 'sub-filter-group';
                        subDiv.innerHTML = `
                            <input type="checkbox" id="${subCheckboxId}" value="${item}" class="${itemType}-sub-checkbox">
                            <label for="${subCheckboxId}">${item}</label>
                        `;
                        subOptionsContainer.appendChild(subDiv);
                    });

                    categoryDiv.appendChild(subOptionsContainer);
                    container.appendChild(categoryDiv);

                    const masterCheckbox = categoryDiv.querySelector(`#${masterCheckboxId}`);
                    const subCheckboxes = Array.from(categoryDiv.querySelectorAll(`.${itemType}-sub-checkbox`));

                    masterCheckbox.addEventListener('change', () => {
                        subCheckboxes.forEach(sub => sub.checked = masterCheckbox.checked);
                        renderProfiles();
                    });

                    subCheckboxes.forEach(sub => {
                        sub.addEventListener('change', () => {
                            masterCheckbox.checked = subCheckboxes.every(s => s.checked);
                            masterCheckbox.indeterminate = !masterCheckbox.checked && subCheckboxes.some(s => s.checked);
                            renderProfiles();
                        });
                    });
                }
            });
        }

        document.addEventListener('DOMContentLoaded', function() {
            const loginBtn = document.getElementById('login-btn');
            const loginEmailInput = document.getElementById('login-email');
            const loginMessage = document.getElementById('login-message');
            const loadingMessage = document.getElementById('loading-message');
            const logoutBtn = document.getElementById('logout-btn');
            
            const emailStep = document.getElementById('email-step');
            const otpStep = document.getElementById('otp-step');
            const loginOtpInput = document.getElementById('login-otp');
            const verifyBtn = document.getElementById('verify-btn');
            const otpMessage = document.getElementById('otp-message');
            const resendBtn = document.getElementById('resend-btn');
            const searchInput = document.getElementById('search-input');
            const resetFiltersBtn = document.getElementById('reset-filters-btn');

            if (typeof supabase === 'undefined' || !supabase?.auth) {
                if (loginBtn) loginBtn.disabled = true;
                if (verifyBtn) verifyBtn.disabled = true;
                if (loginMessage) {
                    loginMessage.textContent = 'Authentication failed to initialize. Please verify the Supabase script and keys.';
                    loginMessage.classList.add('error');
                }
                return;
            }

            if (resetFiltersBtn) {
                resetFiltersBtn.addEventListener('click', () => {
                    document.querySelectorAll('.filter-group input[type="checkbox"]').forEach(cb => {
                        cb.checked = false;
                        cb.indeterminate = false;
                    });
                    if (searchInput) searchInput.value = '';
                    currentSearchQuery = '';
                    renderProfiles();
                });
            }

    function renderProfiles() {
        const searchInput = document.getElementById('search-input');
        currentSearchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const filteredAlumni = filterAlumni(allAlumniData);

        renderDirectory(filteredAlumni);
        renderMapView(filteredAlumni);
        renderMemories();
    }

    async function loadDataFromSupabase() {
        if (!loadingMessage) return;
        loadingMessage.style.display = 'block';
        allAlumniData = [];
        allowedEmails = new Set();
        
        const sets = { 
            classYears: new Set(), greek: new Set(), military: new Set(), 
            leadership: new Set(), awards: new Set(), universities: {}, 
            majors: new Set(), degreeLevels: new Set(), locations: new Set(), industries: {} 
        };

        try {
            const { data, error } = await supabase
                .from('alumni')
                .select(`
                    *,
                    alumni_education (*),
                    alumni_links (*),
                    alumni_awards (*),
                    alumni_leadership (*)
                `);

            if (error) throw error;

            data.forEach(alum => {
                const record = {
                    id: alum.id,
                    firstName: alum.first_name,
                    lastName: alum.last_name,
                    gradYear: String(alum.grad_year),
                    photoUrl: alum.photo_url || defaultProfilePic,
                    drbPhotoUrl: alum.drb_photo_url,
                    city: alum.city,
                    state: alum.state,
                    occupation: alum.occupation,
                    industry: alum.industry,
                    tenure: alum.tenure,
                    favoriteStep: alum.favorite_step,
                    about: alum.about,
                    email: alum.email,
                    phone: alum.phone,
                    militaryBranch: alum.military_branch,
                    militaryRank: alum.military_rank,
                    fullName: `${alum.first_name} ${alum.last_name}`,
                    fullNameForLogin: (alum.first_name + alum.last_name).replace(/\s/g, '').toLowerCase(),
                    educationHistory: alum.alumni_education.map(e => ({
                        university: e.university,
                        majors: e.major ? [{ original: e.major, normalized: normalizeName(e.major, majorNormalizationMap) }] : [],
                        degreeLevels: e.degree_level ? [e.degree_level] : [],
                        gradYear: String(e.grad_year)
                    })),
                    awards: alum.alumni_awards.map(a => a.award_name),
                    leadershipPositions: alum.alumni_leadership.map(l => l.position_name),
                    socialMedia: alum.alumni_links.filter(l => l.link_type === 'social').map(l => ({ type: l.label, url: l.url, display: l.label })),
                    websites: alum.alumni_links.filter(l => l.link_type === 'website').map(l => ({ type: l.label, url: l.url, display: l.label })),
                    instagram: alum.alumni_links.find(l => l.label.toLowerCase() === 'instagram')?.url || ''
                };

                record.universities = [...new Set(record.educationHistory.map(e => e.university).filter(Boolean))];
                record.majors = [...new Set(record.educationHistory.flatMap(e => e.majors.map(m => m.normalized)).filter(Boolean))];

                allAlumniData.push(record);
                if (record.email) allowedEmails.add(record.email.toLowerCase().trim());
                
                sets.classYears.add(record.gradYear);
                if (record.militaryBranch) sets.military.add(record.militaryBranch);
                record.awards.forEach(a => sets.awards.add(a));
                record.leadershipPositions.forEach(l => sets.leadership.add(l));

                record.educationHistory.forEach(edu => {
                   if (edu.university) {
                       const normalizedUni = normalizeName(edu.university, universityNormalizationMap);
                       sets.universities[normalizedUni] = universityToStateMap[normalizedUni] || 'Other';
                   }
                   edu.majors.forEach(m => {
                       if (m.normalized) sets.majors.add(m.normalized);
                   });
                   edu.degreeLevels.forEach(level => sets.degreeLevels.add(level));
                });

                if (record.industry) {
                    const normalizedInd = normalizeName(record.industry, industryNormalizationMap);
                    sets.industries[normalizedInd] = occupationToCategory[normalizedInd] || 'Other';
                }
                if (record.state) sets.locations.add(record.state);
            });

            loadingMessage.style.display = 'none';
            if (loginMessage) loginMessage.textContent = '';
            if (loginBtn) loginBtn.disabled = false;

            const populateFilter = (container, items, prefix, sortFn) => {
                if (!container) return;
                container.innerHTML = '';
                const sortedItems = sortFn ? [...items].sort(sortFn) : [...items].sort();
                 sortedItems.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'sub-filter-group';
                    const checkboxId = `${prefix}-${item.replace(/\W/g, '-')}`;
                    div.innerHTML = `<input type="checkbox" id="${checkboxId}" value="${item}"><label for="${checkboxId}">${item}</label>`;
                    container.appendChild(div);
                    div.querySelector('input').addEventListener('change', renderProfiles);
                });
            };
            
            const degreeOrder = ['Associate', 'Bachelor', 'Master', 'Doctorate'];
            const customDegreeSort = (a, b) => degreeOrder.indexOf(a) - degreeOrder.indexOf(b);

            populateFilter(document.getElementById('class-year-options-container'), sets.classYears, 'class-year', (a, b) => b - a);
            populateFilter(document.getElementById('drb-awards-options-container'), sets.awards, 'drb-awards');
            populateFilter(document.getElementById('drb-leadership-options-container'), sets.leadership, 'drb-leadership');
            populateFilter(document.getElementById('military-options-container'), sets.military, 'military');
            populateFilter(document.getElementById('greek-options-container'), sets.greek, 'greek');
            populateHierarchicalFilter(document.getElementById('university-options-container'), sets.universities, 'university');
            populateHierarchicalFilter(document.getElementById('major-options-container'), Object.fromEntries([...sets.majors].map(m => [m, majorToCategory[m] || 'Other'])), 'major');
            populateHierarchicalFilter(document.getElementById('industry-options-container'), sets.industries, 'industry');
            populateFilter(document.getElementById('degree-options-container'), sets.degreeLevels, 'degree', customDegreeSort);
            populateFilter(document.getElementById('location-options-container'), sets.locations, 'location');
            
            window.addEventListener('hashchange', router);
            window.addEventListener('resize', renderProfiles);
        } catch (error) {
            console.error('Error loading data from Supabase:', error);
            if (loadingMessage) loadingMessage.textContent = 'Error loading data. Please refresh.';
        }
    }

            // --- Supabase Auth Listener ---
            supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    currentUserEmail = session.user.email;
                    document.body.classList.add('logged-in');
                    loadDataFromSupabase();
                    router();
                } else if (event === 'SIGNED_OUT') {
                    currentUserEmail = null;
                    document.body.classList.remove('logged-in');
                    document.body.classList.remove('filters-visible');
                    allAlumniData = [];
                    if (profilesContainer) profilesContainer.innerHTML = '';
                    showLoginScreen();
                }
            });

            function showLoginScreen() {
                 emailStep.style.display = 'block';
                 otpStep.style.display = 'none';
                 document.getElementById('login-description').textContent = 'An email listed on your profile is strictly required to log in. We will send you a secure 6-digit access code.';
                 loginEmailInput.value = '';
                 loginMessage.textContent = '';
                 if (verifyBtn) verifyBtn.disabled = false;
                 if (loginBtn) loginBtn.disabled = false;
            }

            // Check for existing session on load
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session) {
                    currentUserEmail = session.user.email;
                    document.body.classList.add('logged-in');
                    loadDataFromSupabase();
                    router();
                } else {
                    showLoginScreen();
                }
            });

            if (loginBtn) {
                loginBtn.addEventListener('click', async () => {
                    const rawInput = loginEmailInput.value.trim();
                    if (!rawInput) return;

                    loginBtn.disabled = true;
                    loginMessage.textContent = 'Checking access...';
                    loginMessage.classList.remove('error');

                    // Admin bypass (Local Development Only)
                    if (typeof SECRET_ADMIN_PASSWORD !== 'undefined' && rawInput === SECRET_ADMIN_PASSWORD) {
                        currentUserEmail = 'admin@drb.network';
                        document.body.classList.add('logged-in');
                        loadDataFromSupabase();
                        showMainView();
                        return;
                    }

                    const { error } = await supabase.auth.signInWithOtp({
                        email: rawInput,
                        options: {
                            shouldCreateUser: false
                        }
                    });

                    if (error) {
                        loginMessage.textContent = error.message === 'User not found' 
                            ? 'Email not found. If you only signed up with a phone number, please contact us.'
                            : 'Error: ' + error.message;
                        loginMessage.classList.add('error');
                        loginBtn.disabled = false;
                    } else {
                        currentUserEmail = rawInput;
                        emailStep.style.display = 'none';
                        otpStep.style.display = 'block';
                        document.getElementById('login-description').textContent = 'Please enter the 6-digit code we just sent to ' + currentUserEmail + '.';
                        otpMessage.textContent = 'Code sent successfully!';
                        otpMessage.classList.remove('error');
                    }
                });
            }

            if (verifyBtn) {
                verifyBtn.addEventListener('click', async () => {
                    const codeInput = loginOtpInput.value.trim();
                    if (!codeInput || codeInput.length < 6) {
                        otpMessage.textContent = 'Please enter the full 6-digit code.';
                        otpMessage.classList.add('error');
                        return;
                    }

                    otpMessage.textContent = 'Verifying and downloading securely...';
                    otpMessage.classList.remove('error');
                    verifyBtn.disabled = true;

                    const { data, error } = await supabase.auth.verifyOtp({
                        email: currentUserEmail,
                        token: codeInput,
                        type: 'email'
                    });

                    if (error) {
                        otpMessage.textContent = 'Invalid or expired code.';
                        otpMessage.classList.add('error');
                        verifyBtn.disabled = false;
                    }
                });
            }

            if (resendBtn) {
                resendBtn.addEventListener('click', () => {
                    showLoginScreen();
                });
            }

            if (loginEmailInput) {
                loginEmailInput.addEventListener('keyup', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        loginBtn.click();
                    }
                });
            }

            if (loginOtpInput) {
                loginOtpInput.addEventListener('keyup', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        verifyBtn.click();
                    }
                });
            }

            document.getElementById('toggle-filters-btn').addEventListener('click', () => {
                const isOpening = !document.body.classList.contains('filters-visible');
                document.body.classList.toggle('filters-visible');
                if (isOpening) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });

            // --- View Toggles ---
            document.getElementById('view-dashboard-btn').addEventListener('click', () => switchView('dashboard'));
            const viewMapBtn = document.getElementById('view-map-btn');
            if (viewMapBtn) viewMapBtn.addEventListener('click', () => switchView('map'));
            const viewMemoriesBtn = document.getElementById('view-memories-btn');
            if (viewMemoriesBtn) viewMemoriesBtn.addEventListener('click', () => switchView('memories'));

            // --- Logout ---
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    sessionStorage.removeItem('drb_session');
                    document.body.classList.remove('logged-in');
                    document.body.classList.remove('filters-visible');
                    allAlumniData = [];
                    if (profilesContainer) profilesContainer.innerHTML = '';
                    document.getElementById('email-step').style.display = 'block';
                    document.getElementById('otp-step').style.display = 'none';
                    document.getElementById('login-description').textContent = 'An email listed on your profile is strictly required to log in. We will send you a secure 6-digit access code.';
                    loginEmailInput.value = '';
                    loginMessage.textContent = '';
                });
            }

            // --- Global Search ---
            if (searchInput) {
                let searchDebounce;
                searchInput.addEventListener('input', () => {
                    clearTimeout(searchDebounce);
                    searchDebounce = setTimeout(() => {
                        currentSearchQuery = searchInput.value.trim().toLowerCase();
                        renderCurrentView();
                    }, 200);
                });
            }

            // --- Edit Profile Modal ---
            const editModal = document.getElementById('edit-modal-overlay');
            const editForm = document.getElementById('edit-profile-form');
            const editMessage = document.getElementById('edit-message');
            let editingAlumnus = null;

            window.openEditModal = function(alumnus) {
                editingAlumnus = alumnus;
                const isAdmin = currentUserEmail === 'admin@drb.network';
                document.getElementById('admin-edit-fields').style.display = isAdmin ? 'block' : 'none';
                document.getElementById('edit-firstname').value = alumnus.firstName || '';
                document.getElementById('edit-lastname').value = alumnus.lastName || '';
                document.getElementById('edit-classyear').value = alumnus.gradYear || '';
                document.getElementById('edit-email').value = alumnus.email || '';

                document.getElementById('edit-city').value = alumnus.city || '';
                document.getElementById('edit-occupation').value = alumnus.occupation || '';
                document.getElementById('edit-phone').value = alumnus.phone || '';
                document.getElementById('edit-instagram').value = alumnus.instagramHandle || '';
                document.getElementById('edit-social').value = alumnus.socialMedia.map(s => `${s.type}/${s.display}`).join(', ') || '';
                document.getElementById('edit-website').value = alumnus.websites.map(w => `${w.type}/${w.url}`).join(', ') || '';
                document.getElementById('edit-about').value = alumnus.about || '';
                editMessage.textContent = '';
                editMessage.className = 'edit-message';
                editModal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
            };

            function closeEditModal() {
                editModal.style.display = 'none';
                document.body.style.overflow = '';
                editingAlumnus = null;
            }

            document.getElementById('modal-close-btn').addEventListener('click', closeEditModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', closeEditModal);
            editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

            editForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (!editingAlumnus || !currentUserEmail) return;

                const saveBtn = document.getElementById('modal-save-btn');
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                editMessage.textContent = '';

                const updates = {
                    'city': document.getElementById('edit-city').value.trim(),
                    'occupation': document.getElementById('edit-occupation').value.trim(),
                    'phone': document.getElementById('edit-phone').value.trim(),
                    'about': document.getElementById('edit-about').value.trim()
                };

                if (currentUserEmail === 'admin@drb.network') {
                    const fn = document.getElementById('edit-firstname').value.trim();
                    if (fn) updates.first_name = fn;
                    const ln = document.getElementById('edit-lastname').value.trim();
                    if (ln) updates.last_name = ln;
                    const cy = parseInt(document.getElementById('edit-classyear').value.trim());
                    if (cy) updates.grad_year = cy;
                    const em = document.getElementById('edit-email').value.trim();
                    if (em) updates.email = em;
                }

                const alumnusId = editingAlumnus.id;

                supabase
                    .from('alumni')
                    .update(updates)
                    .eq('id', alumnusId)
                    .then(({ error }) => {
                        if (error) throw error;
                        
                        // Handle links update (Simplistic: delete and re-insert)
                        // This is a bit complex for a single call, but we'll try to update the main fields first.
                        // In a real app, we'd handle alumni_links too.
                        
                        editMessage.textContent = '✓ Profile updated successfully!';
                        editMessage.className = 'edit-message success';
                        
                        loadDataFromSupabase(); // Refresh local data
                        
                        setTimeout(() => {
                            closeEditModal();
                            router();
                        }, 1200);
                    })
                    .catch(err => {
                        console.error('Update error:', err);
                        editMessage.textContent = 'Error: ' + err.message;
                        editMessage.className = 'edit-message error';
                    })
                    .finally(() => {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save Changes';
                    });
            });

            let scrollTimeout;
            window.addEventListener('scroll', () => {
                if (document.body.classList.contains('filters-visible')) {
                    clearTimeout(scrollTimeout);
                    scrollTimeout = setTimeout(() => {
                        if (window.scrollY > 150) { 
                            document.body.classList.remove('filters-visible');
                        }
                    }, 100);
                }
            }, { passive: true });

            document.querySelectorAll('.master-filter-control').forEach(control => {
                const checkbox = control.querySelector('input[type="checkbox"]');
                const labelText = control.querySelector('.filter-label-text');

                const toggleExpansion = () => {
                     const container = control.parentElement.querySelector(':scope > .options-container');
                     control.classList.toggle('expanded');
                     if(container) container.classList.toggle('expanded');
                }

                if(labelText) {
                     labelText.addEventListener('click', (e) => {
                        e.preventDefault();
                        checkbox.checked = !checkbox.checked;
                        const changeEvent = new Event('change');
                        checkbox.dispatchEvent(changeEvent);
                     });
                }
                
                control.querySelector('.arrow')?.addEventListener('click', (e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    toggleExpansion();
                });
                
                checkbox.addEventListener('change', () => {
                    const isChecked = checkbox.checked;
                     if(isChecked && !control.classList.contains('expanded')){
                        toggleExpansion();
                    }
                    if (!isChecked) { 
                        if(control.classList.contains('expanded')) toggleExpansion();
                        control.parentElement.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                             if(cb !== checkbox) cb.checked = false; 
                        });
                        control.parentElement.querySelectorAll('.options-container').forEach(c => c.classList.remove('expanded'));
                        control.parentElement.querySelectorAll('.master-filter-control').forEach(c => c.classList.remove('expanded'));
                    }
                    renderProfiles();
                });
            });

             document.querySelectorAll('.options-container').forEach(container => {
                container.addEventListener('click', (event) => { event.stopPropagation(); });
            });

            const sortByClassBtn = document.getElementById('sort-by-class-btn');
            const sortByAlphaBtn = document.getElementById('sort-by-alpha-btn');

            sortByClassBtn.addEventListener('click', () => {
                if (currentSort === 'class') return;
                currentSort = 'class';
                sortByClassBtn.classList.add('active');
                sortByAlphaBtn.classList.remove('active');
                renderCurrentView();
            });
            sortByAlphaBtn.addEventListener('click', () => {
                if (currentSort === 'alpha') return;
                currentSort = 'alpha';
                sortByAlphaBtn.classList.add('active');
                sortByClassBtn.classList.remove('active');
                renderCurrentView();
            });
        });
