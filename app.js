const APPS_SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';

// --- This URL points to your Google Sheet ---
        const googleSheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTHcndXfYMgUm1eRG0IvoReaBxXowGhiay23WbY9JegVZkTlV1TI6_xFZY-GJq8UZEEMOdACI-2nOIb/pub?gid=370192004&single=true&output=csv';
        const defaultProfilePic = 'https://www.jotform.com/uploads/blueskyfun1/252616172364052/6341221063296455563/DRB%20Logo%20%28White%29.jpg';

        let allAlumniData = [];
        let lastNavigationTime = 0;
        let allowedEmails = new Set();
        let currentSort = 'class'; // 'class' or 'alpha'




        function normalizeName(name, map) {
            if (!name) return '';
            const lowerName = name.trim().toLowerCase().replace(/&/g, 'and');
            const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);
            for (const key of sortedKeys) {
                if (lowerName.includes(key)) { return map[key]; }
            }
            const exceptions = ['of', 'a', 'the', 'and', 'an', 'in', 'on', 'at', 'for'];
            return name.trim().split(' ').map((word, index) => {
                const lowerWord = word.toLowerCase();
                if (index > 0 && exceptions.includes(lowerWord)) { return lowerWord; }
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }).join(' ');
        }
        
        const mainView = document.getElementById('main-view');
        const profileView = document.getElementById('profile-view');
        const profilesContainer = document.getElementById('profiles-container');


        function renderProfiles() {
            profilesContainer.innerHTML = ''; 

            const activeFilters = {
                classYears: { active: document.getElementById('class-year-master-filter').checked, values: new Set(Array.from(document.querySelectorAll('#class-year-options-container input:checked')).map(cb => cb.value)) },
                honorees: { active: document.getElementById('honorees-master-filter').checked, awards: new Set(Array.from(document.querySelectorAll('#drb-awards-options-container input:checked')).map(cb => cb.value)), leadership: new Set(Array.from(document.querySelectorAll('#drb-leadership-options-container input:checked')).map(cb => cb.value))},
                education: { active: document.getElementById('education-master-filter').checked, universities: new Set(Array.from(document.querySelectorAll('#university-options-container .university-sub-checkbox:checked')).map(cb => cb.value)), majors: new Set(Array.from(document.querySelectorAll('#major-options-container .major-sub-checkbox:checked')).map(cb => cb.value)), degrees: new Set(Array.from(document.querySelectorAll('#degree-options-container input:checked')).map(cb => cb.value)), greek: new Set(Array.from(document.querySelectorAll('#greek-options-container input:checked')).map(cb => cb.value)) },
                career: { active: document.getElementById('career-master-filter').checked, industries: new Set(Array.from(document.querySelectorAll('#industry-options-container .industry-sub-checkbox:checked')).map(cb => cb.value)), military: new Set(Array.from(document.querySelectorAll('#military-options-container input:checked')).map(cb => cb.value)) },
                location: { active: document.getElementById('location-master-filter').checked, values: new Set(Array.from(document.querySelectorAll('#location-options-container input:checked')).map(cb => cb.value)) }
            };

            const filteredAlumni = allAlumniData.filter(alum => {
                if (activeFilters.classYears.active && activeFilters.classYears.values.size > 0) {
                    if (!activeFilters.classYears.values.has(alum.gradYear)) return false;
                }
                if(activeFilters.honorees.active){
                    const awardsMatch = activeFilters.honorees.awards.size === 0 || alum.awards.some(award => activeFilters.honorees.awards.has(award));
                    const leadershipMatch = activeFilters.honorees.leadership.size === 0 || alum.leadershipPositions.some(pos => activeFilters.honorees.leadership.has(pos));
                    if (!(awardsMatch && leadershipMatch)) return false;
                    if(activeFilters.honorees.awards.size === 0 && activeFilters.honorees.leadership.size === 0) { if (alum.awards.length === 0 && alum.leadershipPositions.length === 0) return false; }
                }

                if (activeFilters.education.active) {
                    const uniMatch = activeFilters.education.universities.size === 0 || alum.universities.some(u => activeFilters.education.universities.has(u));
                    const majorMatch = activeFilters.education.majors.size === 0 || alum.majors.some(m => activeFilters.education.majors.has(m));
                    const degreeMatch = activeFilters.education.degrees.size === 0 || alum.educationHistory.some(edu => edu.degreeLevels.some(level => activeFilters.education.degrees.has(level)));
                    const greekMatch = activeFilters.education.greek.size === 0 || activeFilters.education.greek.has(alum.greekAffiliation);
                    if (!(uniMatch && majorMatch && degreeMatch && greekMatch)) return false;
                    if (activeFilters.education.universities.size === 0 && activeFilters.education.majors.size === 0 && activeFilters.education.degrees.size === 0 && activeFilters.education.greek.size === 0) { if (!alum.hasEducation && !alum.greekAffiliation) return false; }
                }

                if(activeFilters.career.active){
                    const industryMatch = activeFilters.career.industries.size === 0 || activeFilters.career.industries.has(alum.industry);
                    const militaryMatch = activeFilters.career.military.size === 0 || activeFilters.career.military.has(alum.militaryBranch);
                    if(!(industryMatch && militaryMatch)) return false;
                    if(activeFilters.career.industries.size === 0 && activeFilters.career.military.size === 0) { if(!alum.industry && !alum.hasMilitaryService) return false;}
                }
                
                if (activeFilters.location.active) {
                    if (activeFilters.location.values.size > 0) { if (!activeFilters.location.values.has(alum.state)) return false; } 
                    else { if (!alum.state) return false; }
                }
                return true;
            });

            if (filteredAlumni.length === 0) {
                 profilesContainer.innerHTML = '<p id="no-results-message">No profiles match the current filters.</p>';
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

                        const mainImageUrl = alumnus.photoUrl || defaultProfilePic;
                        const drbImageUrl = alumnus.drbPhotoUrl || mainImageUrl;

                        let summaryHtml = '';
                        if (alumnus.occupation) summaryHtml += `<p><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zM10 4h4v2h-4V4zm10 15H4V8h16v11z"/></svg>${alumnus.occupation}</p>`;
                        if (alumnus.city) summaryHtml += `<p><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>${alumnus.city}</p>`;

                        let drbHtml = '';
                        if (alumnus.tenure || alumnus.awards.length > 0 || alumnus.favoriteStep || alumnus.leadershipPositions.length > 0) {
                            drbHtml += '<div class="detail-section"><h3>DRB Info</h3><ul>';
                            if (alumnus.tenure) drbHtml += `<li><strong>Tenure:</strong> <div>${alumnus.tenure}-year${alumnus.tenure === '1' ? '' : 's'} member</div></li>`;
                            if (alumnus.leadershipPositions.length > 0) drbHtml += `<li><strong>Leadership:</strong> <div>${alumnus.leadershipPositions.join(', ')}</div></li>`;
                            if (alumnus.awards.length > 0) drbHtml += `<li><strong>Awards:</strong> <div>${alumnus.awards.join(', ')}</div></li>`;
                            if (alumnus.favoriteStep) drbHtml += `<li><strong>Favorite Step:</strong> <div>${alumnus.favoriteStep}</div></li>`;
                            drbHtml += '</ul></div>';
                        }
                        
                        let eduHtml = '';
                        if (alumnus.hasEducation) {
                            eduHtml += '<div class="detail-section"><h3>Higher Education</h3><ul>';
                            alumnus.educationHistory.forEach(edu => {
                                eduHtml += `<li><strong>${edu.university}</strong>`;
                                let details = [];
                                if (edu.majors.length > 0) details.push(`Major(s): ${edu.majors.map(m => m.original).join(', ')}`);
                                if (edu.degrees.length > 0) details.push(`Degree(s): ${edu.degrees.join(', ')}`);
                                if (edu.gradYear) details.push(`Class of ${edu.gradYear}`);
                                if (details.length > 0) eduHtml += `<small>${details.join(' | ')}</small>`;
                                eduHtml += `</li>`;
                            });
                            eduHtml += '</ul></div>';
                        }
                        
                        let militaryHtml = '';
                        if (alumnus.hasMilitaryService) {
                            militaryHtml += '<div class="detail-section"><h3>Military Service</h3><ul>';
                            if (alumnus.militaryBranch) militaryHtml += `<li><strong>Branch:</strong> <div>${alumnus.militaryBranch}</div></li>`;
                            if (alumnus.militaryRank) militaryHtml += `<li><strong>Rank:</strong> <div>${alumnus.militaryRank}</div></li>`;
                            militaryHtml += '</ul></div>';
                        }

                        let greekHtml = '';
                        if (alumnus.greekAffiliation) {
                            greekHtml += `<div class="detail-section"><h3>Greek Affiliation</h3><ul><li><div>${alumnus.greekAffiliation}</div></li></ul></div>`;
                        }

                        let aboutHtml = '';
                        if (alumnus.about) {
                            aboutHtml += `<div class="detail-section"><h3>Highlights</h3><p>${alumnus.about}</p></div>`;
                        }

                        let contactHtml = '';
                        let hasContact = alumnus.email || alumnus.phone || alumnus.instagramUrl || alumnus.socialMedia.length > 0 || alumnus.websites.length > 0;
                        if (hasContact) {
                            contactHtml += '<div class="detail-section"><h3>Contact Info</h3><ul>';
                            if (alumnus.email) { contactHtml += `<li><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg><div><a href="mailto:${alumnus.email}">${alumnus.email}</a></div></li>`; }
                            if (alumnus.phone) { contactHtml += `<li><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.02.74-.25 1.02l-2.2 2.2z"/></svg><div>${alumnus.phone}</div></li>`; }
                            if (alumnus.instagramUrl) { contactHtml += `<li>${socialIcons.instagram}<div><a href="${alumnus.instagramUrl}" target="_blank" rel="noopener noreferrer">${alumnus.instagramHandle}</a></div></li>`; }
                            alumnus.socialMedia.forEach(social => { const icon = socialIcons[social.type.toLowerCase()] || socialIcons.social; contactHtml += `<li>${icon}<div><a href="${social.url}" target="_blank" rel="noopener noreferrer">${social.display}</a></div></li>` });
                            alumnus.websites.forEach(site => { contactHtml += `<li>${socialIcons.website}<div><a href="${site.url}" target="_blank" rel="noopener noreferrer">${site.display} (${site.type})</a></div></li>` });
                            contactHtml += '</ul></div>';
                        }
                        
                        cardDiv.innerHTML = `
                            <div class="card-main">
                                <div class="card-header">
                                    <img class="mobile-img" src="${mainImageUrl}" data-main-src="${mainImageUrl}" data-drb-src="${drbImageUrl}" alt="Profile photo" onerror="this.onerror=null;this.src='${defaultProfilePic}';">
                                    <div class="name-info">
                                        <p class="name">${alumnus.firstName} ${alumnus.lastName}</p>
                                        <p class="year">Class of ${alumnus.gradYear}</p>
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
                                
                                const mainImageUrl = alumnus.photoUrl || defaultProfilePic;
                                const drbImageUrl = alumnus.drbPhotoUrl || mainImageUrl;
                                const hasDrbPhoto = !!alumnus.drbPhotoUrl;

                                if (!hasDrbPhoto) {
                                    cardDiv.classList.add('no-hover');
                                }

                                cardDiv.innerHTML = `
                                    <div class="desktop-img-container">
                                        <img class="desktop-img front-face" src="${mainImageUrl}" alt="Profile photo of ${alumnus.firstName} ${alumnus.lastName}" onerror="this.onerror=null;this.src='${defaultProfilePic}';">
                                        <img class="desktop-img back-face" src="${drbImageUrl}" alt="DRB photo of ${alumnus.firstName} ${alumnus.lastName}" onerror="this.onerror=null;this.src='${defaultProfilePic}';">
                                    </div>
                                    <div class="info"><p class="name">${alumnus.firstName} ${alumnus.lastName}</p></div>`;
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
                        
                        const mainImageUrl = alumnus.photoUrl || defaultProfilePic;
                        const drbImageUrl = alumnus.drbPhotoUrl || mainImageUrl;
                        const hasDrbPhoto = !!alumnus.drbPhotoUrl;

                        if (!hasDrbPhoto) {
                            cardDiv.classList.add('no-hover');
                        }

                        cardDiv.innerHTML = `
                            <div class="desktop-img-container">
                                <img class="desktop-img front-face" src="${mainImageUrl}" alt="Profile photo of ${alumnus.firstName} ${alumnus.lastName}" onerror="this.onerror=null;this.src='${defaultProfilePic}';">
                                <img class="desktop-img back-face" src="${drbImageUrl}" alt="DRB photo of ${alumnus.firstName} ${alumnus.lastName}" onerror="this.onerror=null;this.src='${defaultProfilePic}';">
                            </div>
                            <div class="info"><p class="name">${alumnus.firstName} ${alumnus.lastName}</p></div>`;
                        cardsContainer.appendChild(cardDiv);
                    });
                    profilesContainer.appendChild(cardsContainer);
                }
            }
        }
        
        function showProfile(alumnusId) {
            const alumnus = allAlumniData.find(a => a.id === alumnusId);
            if (!alumnus) {
                showMainView();
                return;
            }
            
            document.getElementById('page-top-bar').style.display = 'none';
            document.getElementById('filter-panel').style.display = 'none';
            mainView.style.display = 'none';
            profileView.style.display = 'block';

            const imageContainer = profileView.querySelector('.profile-image-container');
            
            imageContainer.querySelector('.front-face').src = alumnus.photoUrl || defaultProfilePic;
            imageContainer.querySelector('.back-face').src = alumnus.drbPhotoUrl || defaultProfilePic;
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
                contactHtml += `<li><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg><a href="mailto:${alumnus.email}">${alumnus.email}</a></li>`;
            }
            if (alumnus.phone) {
                contactHtml += `<li><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.02.74-.25 1.02l-2.2 2.2z"/></svg><span>${alumnus.phone}</span></li>`;
            }
            if (alumnus.instagramUrl) {
                contactHtml += `<li>${socialIcons.instagram}<a href="${alumnus.instagramUrl}" target="_blank" rel="noopener noreferrer">${alumnus.instagramHandle}</a></li>`;
            }
            alumnus.socialMedia.forEach(social => {
                const icon = socialIcons[social.type.toLowerCase()] || socialIcons.social;
                contactHtml += `<li>${icon}<a href="${social.url}" target="_blank" rel="noopener noreferrer">${social.display}</a></li>`
            });
            alumnus.websites.forEach(site => {
                contactHtml += `<li>${socialIcons.website}<a href="${site.url}" target="_blank" rel="noopener noreferrer">${site.display} (${site.type})</a></li>`
            });
            contactHtml += '</ul>';
            if (contactHtml !== '<ul></ul>') contactContainer.innerHTML = contactHtml;

            detailsContainer.innerHTML += createDetailSection('Occupation / Industry', alumnus.occupation);
            if (alumnus.hasEducation) {
                let eduHtml = '<div class="detail-section"><h3>Higher Education</h3><ul>';
                alumnus.educationHistory.forEach(edu => {
                    eduHtml += `<li><strong>${edu.university}</strong>`;
                    let details = [];
                    if (edu.majors.length > 0) details.push(`Major(s): ${edu.majors.map(m => m.original).join(', ')}`);
                    if (edu.degrees.length > 0) details.push(`Degree(s): ${edu.degrees.join(', ')}`);
                    if (edu.gradYear) details.push(`Class of ${edu.gradYear}`);
                    if (details.length > 0) eduHtml += `<br><small>${details.join(' | ')}</small>`;
                    eduHtml += `</li>`;
                });
                eduHtml += '</ul></div>';
                detailsContainer.innerHTML += eduHtml;
            }
            if (alumnus.hasMilitaryService) {
                let militaryHtml = '<div class="detail-section"><h3>Military Service</h3><ul>';
                if (alumnus.militaryBranch) militaryHtml += `<li><strong>Branch:</strong> ${alumnus.militaryBranch}</li>`;
                if (alumnus.militaryRank) militaryHtml += `<li><strong>Rank:</strong> ${alumnus.militaryRank}</li>`;
                militaryHtml += '</ul></div>';
                detailsContainer.innerHTML += militaryHtml;
            }
            detailsContainer.innerHTML += createDetailSection('Greek Affiliation', alumnus.greekAffiliation);
            detailsContainer.innerHTML += createDetailSection('Highlights', alumnus.about);

            let drbHtml = '';
            if (alumnus.tenure || alumnus.awards.length > 0 || alumnus.favoriteStep || alumnus.leadershipPositions.length > 0) {
                drbHtml = '<ul class="stats-list">';
                if (alumnus.tenure) drbHtml += `<li><strong>Tenure:</strong> ${alumnus.tenure}-year${alumnus.tenure === '1' ? '' : 's'} member</li>`;
                if (alumnus.leadershipPositions.length > 0) drbHtml += `<li><strong>Leadership:</strong> ${alumnus.leadershipPositions.join(', ')}</li>`;
                if (alumnus.awards.length > 0) drbHtml += `<li><strong>Awards:</strong> ${alumnus.awards.join(', ')}</li>`;
                if (alumnus.favoriteStep) drbHtml += `<li><strong>Favorite Step:</strong> ${alumnus.favoriteStep}</li>`;
                drbHtml += '</ul>';
                drbStatsContainer.innerHTML = drbHtml;
            }
        }

        function showMainView() {
            profileView.style.display = 'none';
            document.getElementById('page-top-bar').style.display = 'flex';
            document.getElementById('filter-panel').style.display = 'block';
            mainView.style.display = 'block';
            window.location.hash = '';
            renderProfiles();
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



            function loadDataAndRender(csvText) {
                    loadingMessage.style.display = 'none';
                const data = Papa.parse(csvText, { skipEmptyLines: true }).data;
                    if (data.length < 1) return;

                    const headers = data[0].map(h => h.trim().replace(/^"|"$/g, ''));
                    
                    const headerIndices = {
                        firstName: headers.indexOf('Name - First Name'), lastName: headers.indexOf('Name - Last Name'), gradYear: headers.indexOf('ERHS Graduation Year'),
                        photoUrl: headers.indexOf('Upload a photo for your profile (current photo)'), drbPhotoUrl: headers.indexOf('Upload a photo of you on DRB'),
                        greek: headers.indexOf('Greek Affiliation'), military: headers.indexOf('Military'), leadership: headers.indexOf('Leadership Positions Held'),
                        education: headers.indexOf('Education (can add multiple)'), tenure: headers.indexOf('Tenure on DRB (Years)'), awards: headers.indexOf('DRB Awards'),
                        favoriteStep: headers.indexOf('Favorite Step'), city: headers.indexOf('Which city do you live in now?'), occupation: headers.indexOf('What\'s your occupation or what industry are you in?'),
                        rank: headers.indexOf('Military Rank'), about: headers.indexOf('Anything else you want to add about yourself (accolades, shameless plugs, advice, etc)'),
                        email: headers.indexOf('Email'), phone: headers.indexOf('Phone Number'), instagram: headers.indexOf('Instagram (join our group chat if you’re not already in)'),
                        consent: headers.indexOf('I am okay with having my contact shared so other DRB alumni can contact me (networking, mentoring, etc.)'),
                        socialMedia: headers.indexOf('Social Media'), websites: headers.indexOf('Websites')
                    };

                    if (headerIndices.firstName === -1 || headerIndices.lastName === -1 || headerIndices.gradYear === -1) {
                         loadingMessage.textContent = 'Error: Core columns are missing. Check sheet for Name and Graduation Year.';
                         loadingMessage.style.display = 'block'; console.error("Missing columns. Found headers:", headers); return;
                    }

                    const sets = { classYears: new Set(), greek: new Set(), military: new Set(), leadership: new Set(), awards: new Set(), universities: {}, majors: new Set(), degreeLevels: new Set(), locations: new Set(), industries: {} };

                    for (let i = 1; i < data.length; i++) {
                        const cells = data[i];
                        if (cells.length < headers.length) continue; 
                        
                        const getCell = (key) => (headerIndices[key] !== -1 && cells[headerIndices[key]]) ? cells[headerIndices[key]].trim() : null;

                        const firstName = getCell('firstName'); const lastName = getCell('lastName'); const gradYear = getCell('gradYear');
                        if (!firstName || !lastName || !gradYear) continue;
                        sets.classYears.add(gradYear);
                        
                        const hasData = (value) => value && value.toLowerCase() !== 'n/a' && value !== '';
                        
                        const emailForLogin = getCell('email');
                        if (hasData(emailForLogin)) {
                            allowedEmails.add(emailForLogin.trim().toLowerCase());
                        }

                        const cityRaw = getCell('city');
                        let state = null;
                        if (hasData(cityRaw)) {
                            const parts = cityRaw.split(/,?\s+/);
                            let foundLocation = null;

                            // Reverse loop to check for multi-word locations first (e.g., 'South Korea')
                            for (let j = parts.length; j > 0; j--) {
                                const potentialLoc = parts.slice(j - 1, j).join(' ');
                                const upperLoc = potentialLoc.toUpperCase();
                                
                                if (countryCodeMap[upperLoc]) { foundLocation = countryCodeMap[upperLoc]; break; }
                                if (stateAbbreviationMap[upperLoc]) { foundLocation = stateAbbreviationMap[upperLoc]; break; }
                                if (Object.values(stateAbbreviationMap).map(s => s.toUpperCase()).includes(upperLoc)) { foundLocation = Object.values(stateAbbreviationMap).find(s => s.toUpperCase() === upperLoc); break; }
                            }
                            
                            state = foundLocation || parts[parts.length - 1].trim();
                            if(state) sets.locations.add(state);
                        }

                        let currentEducationHistory = [];
                        const educationRaw = getCell('education');
                        if (hasData(educationRaw)) {
                            educationRaw.split('\n').forEach(entry => {
                                const uniMatch = entry.match(/University:\s*([^,]+)/);
                                const majorMatch = entry.match(/Major\(s\):\s*(.+?)(?=,\s*Degree:|$)/);
                                const degreeMatch = entry.match(/Degree:\s*(.+?)(?=,\s*Graduation Year:|$)/);
                                const gradYearMatch = entry.match(/Graduation Year:\s*(\d{4})/);
                                
                                const normalizedUni = uniMatch && uniMatch[1] ? normalizeName(uniMatch[1], universityNormalizationMap) : null;
                                const majors = majorMatch && majorMatch[1] ? majorMatch[1].split(/[\/,]+/).map(m => ({
                                    original: m.trim(),
                                    normalized: normalizeName(m, majorNormalizationMap)
                                })).filter(m => m.normalized) : [];
                                
                                const degrees = degreeMatch && degreeMatch[1] ? degreeMatch[1].split(/[\/,]+/).map(d => normalizeName(d, degreeNormalizationMap)).filter(Boolean) : [];
                                
                                const educationGradYear = gradYearMatch && gradYearMatch[1] ? gradYearMatch[1] : null;

                                const degreeLevels = new Set();
                                degrees.forEach(degree => {
                                    if(degree){
                                        const lowerDegree = degree.toLowerCase();
                                        if (lowerDegree.includes('bachelor')) degreeLevels.add('Bachelor');
                                        else if (lowerDegree.includes('master')) degreeLevels.add('Master');
                                        else if (lowerDegree.includes('doctor')) degreeLevels.add('Doctorate');
                                        else if (lowerDegree.includes('associate')) degreeLevels.add('Associate');
                                    }
                                });
                                if (degreeLevels.size > 0) {
                                    degreeLevels.forEach(level => sets.degreeLevels.add(level));
                                }

                                if (normalizedUni) {
                                    let uniState = universityToStateMap[normalizedUni];
                                    if (!uniState) { // If not in the explicit map, try to infer from name
                                        const allStateNames = Object.values(stateAbbreviationMap);
                                        const foundState = allStateNames.find(stateName => normalizedUni.includes(stateName));
                                        if (foundState) {
                                            uniState = foundState;
                                        }
                                    }
                                    sets.universities[normalizedUni] = uniState || 'Other';

                                    majors.forEach(m => sets.majors.add(m.normalized));
                                currentEducationHistory.push({ university: escapeHTML(normalizedUni), majors: majors, degrees: degrees, gradYear: educationGradYear, degreeLevels: [...degreeLevels] });
                                }
                            });
                        }
                        
                        const leadershipRaw = getCell('leadership');
                        const leadershipPositions = hasData(leadershipRaw) ? leadershipRaw.split(/[\n,]+/).map(p => p.trim()).filter(Boolean) : [];
                        leadershipPositions.forEach(p => sets.leadership.add(p));
                        
                        const awardsRaw = getCell('awards');
                        const awards = hasData(awardsRaw) ? awardsRaw.split(/[\n,]+/).map(p => p.trim()).filter(Boolean) : [];
                        awards.forEach(p => sets.awards.add(p));

                        const militaryBranch = getCell('military');
                        if (hasData(militaryBranch)) sets.military.add(militaryBranch);
                        
                        const greekAffiliationRaw = getCell('greek');
                        let normalizedGreek = null;
                        if (hasData(greekAffiliationRaw)) {
                            normalizedGreek = normalizeName(greekAffiliationRaw, greekNormalizationMap);
                            sets.greek.add(normalizedGreek);
                        }

                        const occupationRaw = getCell('occupation');
                        let normalizedIndustry = null;
                        if(hasData(occupationRaw)){
                           normalizedIndustry = normalizeName(occupationRaw, occupationNormalizationMap);
                           sets.industries[normalizedIndustry] = occupationToCategory[normalizedIndustry] || 'Other';
                        }


                        const consentText = getCell('consent')?.toLowerCase() || '';
                        const email = getCell('email'); const phone = getCell('phone'); const instagram = getCell('instagram');
                        let instagramHandle = null, instagramUrl = null;
                        if (hasData(instagram)) {
                            instagramHandle = instagram.startsWith('@') ? instagram : '@' + instagram;
                            instagramUrl = `https://www.instagram.com/${instagramHandle.substring(1)}`;
                        }
                        
                        const socialMediaRaw = getCell('socialMedia');
                        const currentSocials = [];
                        if(hasData(socialMediaRaw)) {
                            socialMediaRaw.split('\n').forEach(line => {
                                const typeMatch = line.match(/Type(?:\s\(.*?\))?:\s*([^,]+)/i);
                                const handleMatch = line.match(/(?:Handle|URL):\s*(.*)/i);
                                if(typeMatch && handleMatch) {
                                    const type = typeMatch[1].trim(); const handle = handleMatch[1].trim();
                                    let url = handle; if (!/^(https?:\/\/)/i.test(url)) url = 'https://' + url;
                                    let display = handle.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
                                    const lowerType = type.toLowerCase(); const lowerHandle = handle.toLowerCase();
                                    if (lowerType === 'linkedin') { const username = (lowerHandle.split('/in/')[1] || '').split('/')[0]; if (username) { url = `https://www.linkedin.com/in/${username}`; display = username; }
                                    } else if (lowerType === 'twitch') { const username = (lowerHandle.split('twitch.tv/')[1] || ''); if (username) { url = `https://www.twitch.tv/${username}`; display = username.split('/')[0]; } }
                                currentSocials.push({ type: escapeHTML(type), display: escapeHTML(display), url: escapeHTML(url) });
                                }
                            });
                        }
                        
                        const websitesRaw = getCell('websites');
                        const currentWebsites = [];
                        if (hasData(websitesRaw)) {
                            websitesRaw.split('\n').forEach(line => {
                                const typeMatch = line.match(/Type(?:\s\(.*?\))?:\s*([^,]+)/i);
                                const urlMatch = line.match(/URL:\s*(.*)/i);
                                if (typeMatch && urlMatch) {
                                    const type = typeMatch[1].trim(); let url = urlMatch[1].trim();
                                    if (url) {
                                        const display = url.replace(/^(https?:\/\/)?(www\.)?/i, '').replace(/\/$/, '');
                                        if (!/^(https?:\/\/)/i.test(url)) url = 'https://' + url;
                                    currentWebsites.push({ type: escapeHTML(type), display: escapeHTML(display), url: escapeHTML(url) });
                                    }
                                }
                            });
                        }

                        allAlumniData.push({
                            id: `${firstName.toLowerCase().replace(/\W/g, '-')}-${lastName.toLowerCase().replace(/\W/g, '-')}-${gradYear}-${i}`,
                        firstName: escapeHTML(firstName), lastName: escapeHTML(lastName), gradYear: escapeHTML(gradYear), photoUrl: getCell('photoUrl'), drbPhotoUrl: getCell('drbPhotoUrl'), city: escapeHTML(cityRaw), state: state,
                        occupation: escapeHTML(occupationRaw), industry: normalizedIndustry, about: escapeHTML(getCell('about')), tenure: escapeHTML(getCell('tenure')), favoriteStep: escapeHTML(getCell('favoriteStep')),
                        awards: awards.map(escapeHTML), greekAffiliation: normalizedGreek,
                        hasMilitaryService: hasData(militaryBranch), militaryBranch: hasData(militaryBranch) ? escapeHTML(militaryBranch) : null, militaryRank: escapeHTML(getCell('rank')),
                        hasLeadershipPositions: leadershipPositions.length > 0, leadershipPositions: leadershipPositions.map(escapeHTML),
                            hasEducation: currentEducationHistory.length > 0, educationHistory: currentEducationHistory,
                            universities: [...new Set(currentEducationHistory.map(edu => edu.university))],
                            majors: [...new Set(currentEducationHistory.flatMap(edu => edu.majors.map(m => m.normalized)))],
                        email: consentText.includes('email') && hasData(email) ? escapeHTML(email) : null,
                        phone: consentText.includes('phone') && hasData(phone) ? escapeHTML(phone) : null,
                            phoneToCompare: consentText.includes('phone') && hasData(phone) ? phone.replace(/\D/g, '') : null,
                        instagramHandle: consentText.includes('social media') && hasData(instagram) ? escapeHTML(instagramHandle) : null,
                        instagramUrl: consentText.includes('social media') && hasData(instagram) ? escapeHTML(instagramUrl) : null,
                        instagramHandleToCompare: consentText.includes('social media') && hasData(instagram) ? escapeHTML(instagram.replace(/^@/, '').toLowerCase()) : null,
                            fullNameForLogin: (firstName + lastName).replace(/\s/g, '').toLowerCase(),
                            socialMedia: consentText.includes('social media') ? currentSocials : [], websites: currentWebsites,
                        });
                    }

                    loginMessage.textContent = '';
                    loginBtn.disabled = false;

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
                    
                    document.querySelector('.back-button').addEventListener('click', (e) => {
                        e.preventDefault(); if (Date.now() - lastNavigationTime < 500) return; showMainView();
                    });

                    profilesContainer.addEventListener('click', (e) => {
                        const toggleBtn = e.target.closest('.details-toggle');
                        if (toggleBtn) {
                            const card = toggleBtn.closest('.mobile-card');
                            const isExpanding = !card.classList.contains('expanded');
                            card.classList.toggle('expanded');
                            
                            const text = toggleBtn.querySelector('span:first-child');
                            text.textContent = isExpanding ? 'Hide Details' : 'Bio and Contact';

                            const img = card.querySelector('.mobile-img');
                            const mainSrc = img.dataset.mainSrc;
                            const drbSrc = img.dataset.drbSrc;
                            
                            if (drbSrc !== mainSrc) {
                                img.style.opacity = '0';
                                setTimeout(() => {
                                    img.src = isExpanding ? drbSrc : mainSrc;
                                    img.style.opacity = '1';
                                }, 400); // Match transition duration
                            }
                            return;
                        }
                        const card = e.target.closest('.profile-card.desktop-card');
                        if (card && card.dataset.id) { e.preventDefault(); lastNavigationTime = Date.now(); window.location.hash = `#profile=${card.dataset.id}`; }
                    });
                }
            
            loginBtn.disabled = false; // Enable login button initially since we don't load DB on start
            loginMessage.textContent = '';

            const emailStep = document.getElementById('email-step');
            const otpStep = document.getElementById('otp-step');
            const loginOtpInput = document.getElementById('login-otp');
            const verifyBtn = document.getElementById('verify-btn');
            const otpMessage = document.getElementById('otp-message');
            const resendBtn = document.getElementById('resend-btn');

            let currentUserEmail = '';

            loginBtn.addEventListener('click', () => {
                const rawInput = loginEmailInput.value.trim();
                if (!rawInput) {
                    loginMessage.textContent = 'Please enter your email.';
                    loginMessage.classList.add('error');
                    return;
                }

                loginMessage.textContent = 'Sending secure code...';
                loginMessage.classList.remove('error');
                loginBtn.disabled = true;

                fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'request_otp', email: rawInput })
                })
                .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok'))
                .then(data => {
                    if (data.success) {
                        currentUserEmail = rawInput;
                        emailStep.style.display = 'none';
                        otpStep.style.display = 'block';
                        document.getElementById('login-description').textContent = 'Please enter the 6-digit code we just sent to ' + currentUserEmail + '.';
                        otpMessage.textContent = 'Code sent successfully!';
                        otpMessage.classList.remove('error');
                    } else {
                        loginMessage.textContent = data.error || 'Email not found. If you only signed up with a phone number, please update your profile via the survey.';
                        loginMessage.classList.add('error');
                        loginBtn.disabled = false;
                    }
                })
                .catch(error => {
                    console.error('Error requesting code:', error);
                    loginMessage.textContent = 'Failed to connect. Please check your connection and try again.';
                    loginMessage.classList.add('error');
                    loginBtn.disabled = false;
                });
            });

            verifyBtn.addEventListener('click', () => {
                const codeInput = loginOtpInput.value.trim();
                if (!codeInput || codeInput.length < 6) {
                    otpMessage.textContent = 'Please enter the full 6-digit code.';
                    otpMessage.classList.add('error');
                    return;
                }

                otpMessage.textContent = 'Verifying and downloading securely...';
                otpMessage.classList.remove('error');
                verifyBtn.disabled = true;

                fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'verify_otp', email: currentUserEmail, code: codeInput })
                })
                .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok'))
                .then(data => {
                    if (data.success) {
                        document.body.classList.add('logged-in');
                        loadDataAndRender(data.csv);
                        router(); // Initial render after login
                    } else {
                        otpMessage.textContent = data.error || 'Invalid code.';
                        otpMessage.classList.add('error');
                        verifyBtn.disabled = false;
                    }
                })
                .catch(error => {
                    console.error('Error verifying code:', error);
                    otpMessage.textContent = 'Failed to connect. Please check your connection and try again.';
                    otpMessage.classList.add('error');
                    verifyBtn.disabled = false;
                });
            });

            resendBtn.addEventListener('click', () => {
                otpStep.style.display = 'none';
                emailStep.style.display = 'block';
                document.getElementById('login-description').textContent = 'Please enter your email to log in. We will send you a secure 6-digit access code.';
                loginBtn.disabled = false;
                loginEmailInput.value = '';
                loginOtpInput.value = '';
                loginMessage.textContent = '';
            });

            loginEmailInput.addEventListener('keyup', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    loginBtn.click();
                }
            });

            loginOtpInput.addEventListener('keyup', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    verifyBtn.click();
                }
            });

            document.getElementById('toggle-filters-btn').addEventListener('click', () => {
                const isOpening = !document.body.classList.contains('filters-visible');
                document.body.classList.toggle('filters-visible');
                if (isOpening) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
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
                renderProfiles();
            });
            sortByAlphaBtn.addEventListener('click', () => {
                if (currentSort === 'alpha') return;
                currentSort = 'alpha';
                sortByAlphaBtn.classList.add('active');
                sortByClassBtn.classList.remove('active');
                renderProfiles();
            });
        });