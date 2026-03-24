const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyFpz59YWg-r54JLA9zHGmiesc9Al2rxrpmnzn1feuO5gAEaYQftA9rvaMzSM6rZOWM2A/exec';
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
        let currentView = 'dashboard'; // 'dashboard', 'map', 'memories'
        let currentFilterMode = 'union'; // 'union' or 'intersection'
        let leafletMap = null;
        let mapMarkers = [];
        let currentSearchQuery = '';
        let currentUserEmail = '';
        let faceCoords = {};
        let geocodeCache = {};
        let contactPreferences = {};
        let greekAffiliations = {};
        let featuredAlumniIds = [];
        const FEATURED_ALUMNI_STORAGE_KEY = 'drb-featured-alumni';
        const REQUEST_MILITARY_BRANCH_OPTIONS = ['Air Force', 'Army', 'Coast Guard', 'Marine Corps', 'Navy', 'National Guard', 'Space Force'];
        const REQUEST_STATE_OPTIONS = [...new Set(Object.values(stateAbbreviationMap))].sort((a, b) => a.localeCompare(b));
        const REQUEST_UNIVERSITY_OPTIONS = [...new Set(
            [...Object.values(universityNormalizationMap), ...Object.keys(universityToStateMap)]
                .map(value => normalizeName(value, universityNormalizationMap))
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));
        const REQUEST_MAJOR_OPTIONS = [...new Set(
            [...Object.keys(majorToCategory), ...Object.values(majorNormalizationMap)]
                .map(value => normalizeName(value, majorNormalizationMap))
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));
        const REQUEST_DEGREE_OPTIONS = [...new Set([
            ...Object.values(degreeNormalizationMap),
            "Associate's Degree",
            "Bachelor's Degree",
            "Master's Degree",
            'Doctor of Philosophy',
            'Doctorate',
            'JD',
            'MD',
            'PharmD'
        ])].sort((a, b) => a.localeCompare(b));
        const REQUEST_GREEK_OPTIONS = [
            'Alpha Phi Alpha',
            'Kappa Alpha Psi',
            'Omega Psi Phi',
            'Phi Beta Sigma',
            'Iota Phi Theta'
        ];
        const REQUEST_OCCUPATION_OPTIONS = [...new Set(Object.values(occupationNormalizationMap))].sort((a, b) => a.localeCompare(b));
        const NORMALIZED_HBCU_LIST = [...new Set(
            hbcuList
                .map(value => normalizeName(value, universityNormalizationMap))
                .filter(Boolean)
        )];
        const NORMALIZED_IVY_LEAGUE_LIST = [...new Set(
            ivyLeagueList
                .map(value => normalizeName(value, universityNormalizationMap))
                .filter(Boolean)
        )];
        const HBCU_UNIVERSITY_SET = new Set(NORMALIZED_HBCU_LIST);
        const IVY_LEAGUE_UNIVERSITY_SET = new Set(NORMALIZED_IVY_LEAGUE_LIST);
        const HBCU_FILTER_LABEL = 'HBCUs';
        const IVY_LEAGUE_FILTER_LABEL = 'Ivy League';
        const MEDICAL_SCHOOL_FILTER_LABEL = 'Medical School';
        const LAW_SCHOOL_FILTER_LABEL = 'Law School';

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

        function getAlumnusKey(firstName, lastName, gradYear) {
            return `${firstName || ''}-${lastName || ''}-${gradYear || ''}`.toLowerCase().replace(/\s+/g, '');
        }

        function getContactLinkLabel(link) {
            const type = canonicalizeText(link?.type || '').toLowerCase();
            if (type === 'linkedin') return 'LinkedIn';
            return link?.display || link?.type || link?.url || '';
        }

        function isMedicalSchoolDegree(degree) {
            const normalized = canonicalizeText(degree).toLowerCase();
            return normalized === 'md'
                || normalized === 'm.d.'
                || normalized === 'doctor of medicine'
                || normalized === 'pharmd'
                || normalized === 'pharm.d.'
                || normalized === 'doctor of pharmacy';
        }

        function isLawSchoolDegree(degree) {
            const normalized = canonicalizeText(degree).toLowerCase();
            return normalized === 'jd'
                || normalized === 'j.d.'
                || normalized === 'juris doctor'
                || normalized === 'doctor of jurisprudence';
        }

        async function loadContactPreferences() {
            try {
                const response = await fetch('data/contact_preferences.json', { cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                contactPreferences = await response.json();
            } catch (error) {
                contactPreferences = {};
                console.warn('Failed to load contact preferences. Defaulting to hidden contact info.', error);
            }
        }

        async function loadGreekAffiliations() {
            try {
                const response = await fetch('data/greek_affiliations.json', { cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const rawAffiliations = await response.json();
                greekAffiliations = Object.fromEntries(
                    Object.entries(rawAffiliations)
                        .map(([key, value]) => [key, normalizeGreekAffiliation(value)])
                        .filter(([, value]) => value)
                );
            } catch (error) {
                greekAffiliations = {};
                console.warn('Failed to load Greek affiliations supplement.', error);
            }
        }




        const escapeHTML = (str) => {
            if (!str) return str;
            return String(str).replace(/[&<>"']/g, match => {
                const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
                return escapeMap[match];
            });
        };

        function canonicalizeText(value) {
            return String(value || '')
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/[\u2013\u2014]/g, '-')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function normalizeName(name, map) {
            if (!name) return '';
            const canonicalName = canonicalizeText(name);
            const lowerName = canonicalName.toLowerCase();
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
            return canonicalName.split(/\s+/).map((word, index) => {
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

        const awardNormalizationMap = {
            'rookie of the year': 'Rookie OTY'
        };

        const invalidAwardPatterns = [
            /^did we have awards\??$/i,
            /^n\/?a$/i,
            /^none$/i,
            /^no$/i
        ];

        function normalizeGreekAffiliation(value) {
            const canonicalValue = canonicalizeText(value)
                .replace(/\s+(?:fraternity|sorority)(?:,)?\s+(?:incorporated|inc\.?)$/i, '')
                .trim();

            if (!canonicalValue || /^n\/?a$/i.test(canonicalValue) || /^none$/i.test(canonicalValue)) {
                return '';
            }

            return normalizeName(canonicalValue, greekNormalizationMap);
        }

        function coerceOptionalBoolean(value) {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;

            const normalizedValue = canonicalizeText(value).toLowerCase();
            if (!normalizedValue) return null;
            if (['true', 't', '1', 'yes', 'y'].includes(normalizedValue)) return true;
            if (['false', 'f', '0', 'no', 'n'].includes(normalizedValue)) return false;
            return null;
        }

        function normalizeAwardName(value) {
            const canonicalValue = canonicalizeText(value);
            if (!canonicalValue || invalidAwardPatterns.some(pattern => pattern.test(canonicalValue))) {
                return '';
            }

            return awardNormalizationMap[canonicalValue.toLowerCase()] || canonicalValue;
        }

        function parseDegreeInfo(rawDegree) {
            const degreeValues = canonicalizeText(rawDegree)
                .split(',')
                .map(value => value.trim())
                .filter(value => value && !/^graduation year:?/i.test(value) && !/^n\/?a$/i.test(value));

            const degrees = degreeValues
                .map(value => normalizeName(value, degreeNormalizationMap) || value)
                .filter(Boolean);

            const degreeLevels = [...new Set(degrees.map(degree => {
                const lower = degree.toLowerCase();
                if (lower.includes('associate')) return 'Associate';
                if (lower.includes('bachelor')) return 'Bachelor';
                if (lower.includes('master') || lower.includes('mlis')) return 'Master';
                if (lower.includes('doctor') || lower.includes('medicine') || lower.includes('pharmd') || lower.includes('jd')) return 'Doctorate';
                return null;
            }).filter(Boolean))];

            return { degrees, degreeLevels };
        }

        function extractIndustryTags(occupation, storedIndustry = '') {
            const text = canonicalizeText(occupation).toLowerCase();
            const matches = [];

            if (text) {
                const sortedKeys = Object.keys(occupationNormalizationMap).sort((a, b) => b.length - a.length);
                sortedKeys.forEach(key => {
                    const normalizedKey = canonicalizeText(key).toLowerCase();
                    const escapedKey = normalizedKey
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                        .replace(/\s+/g, '\\s+');
                    const regex = new RegExp(`(^|[^a-z0-9])${escapedKey}(?=$|[^a-z0-9])`, 'i');

                    if (regex.test(text)) {
                        const mapped = occupationNormalizationMap[key];
                        if (mapped && !matches.includes(mapped)) matches.push(mapped);
                    }
                });
            }

            const normalizedStoredIndustry = storedIndustry ? normalizeName(storedIndustry, occupationNormalizationMap) : '';
            if (normalizedStoredIndustry && !matches.includes(normalizedStoredIndustry)) {
                matches.push(normalizedStoredIndustry);
            }

            if (matches.length === 0 && occupation) {
                const fallback = normalizeName(occupation, occupationNormalizationMap);
                if (fallback) matches.push(fallback);
            }

            const techSpecific = ['Software Engineering', 'AI & Machine Learning', 'Information Technology', 'Data Science', 'Product Management'];
            if (matches.includes('General Engineering') && matches.some(tag => techSpecific.includes(tag))) {
                return matches.filter(tag => tag !== 'General Engineering');
            }

            return matches;
        }
        
        const mainView = document.getElementById('dashboard-view');
        const profileView = document.getElementById('profile-view');
        const profilesContainer = document.getElementById('profiles-container');


        let renderTimeout;
        const renderProfiles = () => {
            if (renderTimeout) cancelAnimationFrame(renderTimeout);
            renderTimeout = requestAnimationFrame(() => renderCurrentView());
        };

        function getCheckedValues(selector) {
            return new Set(Array.from(document.querySelectorAll(selector)).map(cb => cb.value));
        }

        function isFilterChecked(id) {
            return !!document.getElementById(id)?.checked;
        }

        function buildActiveFilterCriteria() {
            const classYears = getCheckedValues('#class-year-options-container input:checked');
            const awards = getCheckedValues('#drb-awards-options-container input:checked');
            const leadership = getCheckedValues('#drb-leadership-options-container input:checked');
            const universities = getCheckedValues('#university-options-container .university-sub-checkbox:checked');
            const majors = getCheckedValues('#major-options-container .major-sub-checkbox:checked');
            const degrees = getCheckedValues('#degree-options-container input:checked');
            const greek = getCheckedValues('#greek-options-container input:checked');
            const industries = getCheckedValues('#industry-options-container .industry-sub-checkbox:checked');
            const military = getCheckedValues('#military-options-container input:checked');
            const locations = getCheckedValues('#location-options-container input:checked');
            const universityTags = getCheckedValues('#university-tag-options-container input:checked');
            const selectedUniversityTagGroups = new Set();
            const selectedUniversityTagSchools = [];

            universityTags.forEach(value => {
                if (value.includes('::')) {
                    const [groupLabel, university] = value.split('::');
                    if (groupLabel && university) {
                        selectedUniversityTagSchools.push({ groupLabel, university });
                    }
                    return;
                }
                selectedUniversityTagGroups.add(value);
            });

            const criteria = [];

            if (classYears.size > 0) {
                criteria.push({
                    key: 'classYears',
                    matches: alum => classYears.has(alum.classYear || alum.gradYear)
                });
            }

            if (awards.size > 0) {
                criteria.push({
                    key: 'awards',
                    matches: alum => alum.awards.some(award => awards.has(award))
                });
            }

            if (leadership.size > 0) {
                criteria.push({
                    key: 'leadership',
                    matches: alum => alum.leadershipPositions.some(position => leadership.has(position))
                });
            }

            if (isFilterChecked('honorees-master-filter') && awards.size === 0 && leadership.size === 0) {
                criteria.push({
                    key: 'honoreesPresence',
                    matches: alum => alum.awards.length > 0 || alum.leadershipPositions.length > 0
                });
            }

            if (universities.size > 0) {
                criteria.push({
                    key: 'universities',
                    matches: alum => alum.educationHistory.some(edu => universities.has(edu.university))
                });
            }

            if (universityTags.size > 0) {
                criteria.push({
                    key: 'universityTags',
                    matches: alum =>
                        (selectedUniversityTagGroups.has(HBCU_FILTER_LABEL) && alum.hasHBCU) ||
                        (selectedUniversityTagGroups.has(IVY_LEAGUE_FILTER_LABEL) && alum.hasIvyLeague) ||
                        (selectedUniversityTagGroups.has(MEDICAL_SCHOOL_FILTER_LABEL) && alum.hasMedicalSchool) ||
                        (selectedUniversityTagGroups.has(LAW_SCHOOL_FILTER_LABEL) && alum.hasLawSchool) ||
                        selectedUniversityTagSchools.some(({ groupLabel, university }) =>
                            alum.educationHistory.some(edu => {
                                if (edu.university !== university) return false;
                                if (groupLabel === HBCU_FILTER_LABEL) return HBCU_UNIVERSITY_SET.has(edu.university);
                                if (groupLabel === IVY_LEAGUE_FILTER_LABEL) return IVY_LEAGUE_UNIVERSITY_SET.has(edu.university);
                                if (groupLabel === MEDICAL_SCHOOL_FILTER_LABEL) return edu.degrees.some(isMedicalSchoolDegree);
                                if (groupLabel === LAW_SCHOOL_FILTER_LABEL) return edu.degrees.some(isLawSchoolDegree);
                                return false;
                            })
                        )
                });
            }

            if (majors.size > 0) {
                criteria.push({
                    key: 'majors',
                    matches: alum => alum.educationHistory.some(edu => edu.majors.some(major => majors.has(major.normalized)))
                });
            }

            if (degrees.size > 0) {
                criteria.push({
                    key: 'degrees',
                    matches: alum => alum.educationHistory.some(edu => edu.degreeLevels.some(level => degrees.has(level)))
                });
            }

            if (greek.size > 0) {
                criteria.push({
                    key: 'greek',
                    matches: alum => greek.has(alum.greekAffiliation)
                });
            }

            if (isFilterChecked('education-master-filter') && universities.size === 0 && universityTags.size === 0 && majors.size === 0 && degrees.size === 0 && greek.size === 0) {
                criteria.push({
                    key: 'educationPresence',
                    matches: alum => alum.hasEducation || !!alum.greekAffiliation
                });
            }

            if (industries.size > 0) {
                criteria.push({
                    key: 'industries',
                    matches: alum => alum.industries.some(industry => industries.has(industry))
                });
            }

            if (military.size > 0) {
                criteria.push({
                    key: 'military',
                    matches: alum => military.has(alum.militaryBranch)
                });
            }

            if (isFilterChecked('career-master-filter') && industries.size === 0 && military.size === 0) {
                criteria.push({
                    key: 'careerPresence',
                    matches: alum => alum.industries.length > 0 || alum.hasMilitaryService
                });
            }

            if (locations.size > 0) {
                criteria.push({
                    key: 'locations',
                    matches: alum => locations.has(alum.state)
                });
            }

            if (isFilterChecked('location-master-filter') && locations.size === 0) {
                criteria.push({
                    key: 'locationPresence',
                    matches: alum => !!alum.state
                });
            }

            return criteria;
        }

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

            const activeCriteria = buildActiveFilterCriteria();
            if (activeCriteria.length === 0) return searchFiltered;

            return searchFiltered.filter(alum => {
                const matches = activeCriteria.map(criteria => criteria.matches(alum));
                return currentFilterMode === 'intersection'
                    ? matches.every(Boolean)
                    : matches.some(Boolean);
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
                            alumnus.socialMedia.forEach(social => { const icon = socialIcons[social.type.toLowerCase()] || socialIcons.social; contactHtml += `<li>${icon}<div><a href="${escapeHTML(social.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(getContactLinkLabel(social))}</a></div></li>` });
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
            const fullCityStr = [alumnus.city, alumnus.state].filter(Boolean).join(', ');
            profileView.querySelector('.city').textContent = fullCityStr ? `📍 ${fullCityStr}` : '';

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
            const yearEl = profileView.querySelector('#profile-main .year');
            yearEl.textContent = `Class of ${alumnus.gradYear}`;
            yearEl.className = `year year-color-${alumnus.gradYear % 4} text-colored`;
            profileView.querySelector('#profile-main .city').textContent = fullCityStr || '';

            const detailsContainer = profileView.querySelector('#profile-details');
            const drbStatsContainer = profileView.querySelector('#profile-drb-stats');
            const contactContainer = profileView.querySelector('#profile-contact-info');
            detailsContainer.innerHTML = '';
            if (drbStatsContainer) drbStatsContainer.innerHTML = '';
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
                contactHtml += `<li>${icon}<a href="${escapeHTML(social.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(getContactLinkLabel(social))}</a></li>`
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
                drbHtml = '<ul>';
                if (alumnus.tenure) drbHtml += `<li><strong>Tenure:</strong> ${escapeHTML(alumnus.tenure)}-year${alumnus.tenure === '1' ? '' : 's'} member</li>`;
                if (alumnus.leadershipPositions.length > 0) drbHtml += `<li><strong>Leadership:</strong> ${alumnus.leadershipPositions.map(escapeHTML).join(', ')}</li>`;
                if (alumnus.awards.length > 0) drbHtml += `<li><strong>Awards:</strong> ${alumnus.awards.map(escapeHTML).join(', ')}</li>`;
                if (alumnus.favoriteStep) drbHtml += `<li><strong>Favorite Step:</strong> ${escapeHTML(alumnus.favoriteStep)}</li>`;
                drbHtml += '</ul>';
                detailsContainer.innerHTML += `<div class="detail-section"><h3>DRB Background</h3>${drbHtml}</div>`;
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

        function getDaysUntilAnniversary(now = new Date()) {
            const currentYear = now.getFullYear();
            let anniversaryDate = new Date(currentYear, 8, 21); // September is month 8 (0-indexed)
            if (now > anniversaryDate) {
                anniversaryDate = new Date(currentYear + 1, 8, 21);
            }
            return Math.ceil(Math.abs(anniversaryDate - now) / (1000 * 60 * 60 * 24));
        }

        function updateDashboardStats(filteredAlumni) {
            const cities = new Set(filteredAlumni.map(a => a.city).filter(Boolean));
            const industries = new Set(filteredAlumni.flatMap(a => a.industries).filter(Boolean));
            const classYears = new Set(filteredAlumni.map(a => a.gradYear).filter(Boolean));
            const statTargets = [
                ['stat-anniversary', getDaysUntilAnniversary()],
                ['stat-total', filteredAlumni.length],
                ['stat-cities', cities.size],
                ['stat-industries', industries.size],
                ['stat-classes', classYears.size]
            ];

            requestAnimationFrame(() => {
                statTargets.forEach(([id]) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '0';
                });
                statTargets.forEach(([id, target]) => animateCounter(id, target));
            });
        }

        function getFeaturedAlumniDayKey(now = new Date()) {
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getFeaturedAlumniFingerprint(alumni) {
            return alumni
                .map(a => String(a.id))
                .sort()
                .join('|');
        }

        function loadStoredFeaturedAlumni(fingerprint) {
            try {
                const raw = window.localStorage.getItem(FEATURED_ALUMNI_STORAGE_KEY);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                if (!parsed || parsed.dayKey !== getFeaturedAlumniDayKey() || parsed.fingerprint !== fingerprint || !Array.isArray(parsed.ids)) {
                    return [];
                }
                return parsed.ids;
            } catch (error) {
                console.warn('Failed to read featured alumni cache:', error);
                return [];
            }
        }

        function storeFeaturedAlumni(ids, fingerprint) {
            try {
                window.localStorage.setItem(FEATURED_ALUMNI_STORAGE_KEY, JSON.stringify({
                    dayKey: getFeaturedAlumniDayKey(),
                    fingerprint,
                    ids
                }));
            } catch (error) {
                console.warn('Failed to store featured alumni cache:', error);
            }
        }

        function getFeaturedAlumniSelection(alumni) {
            const withPhotos = alumni.filter(a => a.hasRealPhoto);
            if (withPhotos.length === 0) return [];

            const fingerprint = getFeaturedAlumniFingerprint(withPhotos);
            const storedIds = loadStoredFeaturedAlumni(fingerprint);
            if (storedIds.length > 0) {
                featuredAlumniIds = storedIds;
            }

            const availableIds = new Set(withPhotos.map(a => a.id));
            const cachedFeatured = featuredAlumniIds
                .map(id => withPhotos.find(a => a.id === id))
                .filter(Boolean);

            const cacheStillValid = cachedFeatured.length === featuredAlumniIds.length
                && featuredAlumniIds.every(id => availableIds.has(id));

            if (cacheStillValid && cachedFeatured.length > 0) {
                return cachedFeatured;
            }

            const pool = [...withPhotos];
            const featured = [];
            for (let i = 0; i < Math.min(3, pool.length); i++) {
                const idx = Math.floor(Math.random() * pool.length);
                featured.push(pool.splice(idx, 1)[0]);
            }

            featuredAlumniIds = featured.map(a => a.id);
            storeFeaturedAlumni(featuredAlumniIds, fingerprint);
            return featured;
        }

        // --- Unified Directory View (Formerly Dashboard/Grid) ---
        function renderDirectory(filteredAlumni) {
            const isFiltered = currentSearchQuery || filteredAlumni.length < allAlumniData.length;
            
            // 1. Interactive Stats
            updateDashboardStats(filteredAlumni);

            // 2. Featured Carousel (Hide if searching/filtering to save space)
            const featuredSection = document.getElementById('featured-section');
            if (isFiltered) {
                featuredSection.style.display = 'none';
            } else {
                featuredSection.style.display = 'block';
                const carousel = document.getElementById('featured-carousel');
                if (carousel) {
                    const featured = getFeaturedAlumniSelection(filteredAlumni);
                    carousel.innerHTML = featured.map(a => {
                        const hasSwap = !!(a.rawPhotoUrl && a.drbPhotoUrl);
                        const featuredFrontImage = a.rawPhotoUrl || a.drbPhotoUrl;
                        const featuredFrontPos = faceCoords[generateFaceKey(featuredFrontImage)] ? `${faceCoords[generateFaceKey(featuredFrontImage)].x}% ${faceCoords[generateFaceKey(featuredFrontImage)].y}%` : 'top center';
                        return `
                        <a href="#profile=${a.id}" class="featured-card${hasSwap ? '' : ' no-swap'}">
                            <div class="featured-img-wrap">
                                <img class="front-face" src="${featuredFrontImage}" alt="${a.firstName}" style="object-position: ${featuredFrontPos}" onerror="this.onerror=null">
                                ${hasSwap ? `<img class="back-face" src="${a.drbPhotoUrl}" alt="${a.firstName} DRB" style="object-position: ${faceCoords[generateFaceKey(a.drbPhotoUrl)] ? `${faceCoords[generateFaceKey(a.drbPhotoUrl)].x}% ${faceCoords[generateFaceKey(a.drbPhotoUrl)].y}%` : 'top center'}" onerror="this.onerror=null">` : ''}
                            </div>
                            <div class="featured-info">
                                <h3>${a.firstName} ${a.lastName}</h3>
                                <p class="year-color-${a.gradYear % 4} text-colored" style="font-weight: 600;">Class of ${a.gradYear}</p>
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
                if (currentSearchQuery) {
                    // Intelligent Search relevance sorting
                    dashData.sort((a, b) => {
                        const aFirst = (a.firstName || '').toLowerCase();
                        const aLast = (a.lastName || '').toLowerCase();
                        const bFirst = (b.firstName || '').toLowerCase();
                        const bLast = (b.lastName || '').toLowerCase();
                        
                        const score = (first, last) => {
                            if (first === currentSearchQuery || last === currentSearchQuery) return 4; // Exact Match
                            if (first.startsWith(currentSearchQuery)) return 3; // First Name startsWith
                            if (last.startsWith(currentSearchQuery)) return 2; // Last Name startsWith
                            if (first.includes(currentSearchQuery) || last.includes(currentSearchQuery)) return 1; // General Substring
                            return 0;
                        };
                        
                        const scoreA = score(aFirst, aLast);
                        const scoreB = score(bFirst, bLast);
                        if (scoreA !== scoreB) return scoreB - scoreA; // Highest score first
                        return aFirst.localeCompare(bFirst) || aLast.localeCompare(bLast); // Tie-breaker alpha
                    });
                } else if (currentSort === 'alpha') {
                    dashData.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
                } else {
                    dashData.sort((a, b) => String(a.gradYear || '').localeCompare(String(b.gradYear || '')) || `${a.firstName}`.localeCompare(`${b.firstName}`));
                }

                gridContainer.innerHTML = dashData.map(a => {
                    const avatarUrl = a.photoUrl || generateAvatar(a.firstName, a.lastName, a.gradYear);
                    const mainPos = faceCoords[generateFaceKey(a.photoUrl)] ? `${faceCoords[generateFaceKey(a.photoUrl)].x}% ${faceCoords[generateFaceKey(a.photoUrl)].y}%` : 'top center';
                    const drbPos = faceCoords[generateFaceKey(a.drbPhotoUrl)] ? `${faceCoords[generateFaceKey(a.drbPhotoUrl)].x}% ${faceCoords[generateFaceKey(a.drbPhotoUrl)].y}%` : 'top center';
                    const hasSwap = !!(a.rawPhotoUrl && a.drbPhotoUrl);
                    return `
                    <a href="#profile=${a.id}" class="grid-card${hasSwap ? '' : ' no-swap'}">
                        <div class="grid-card-img">
                            <img class="front-face" src="${avatarUrl}" alt="${a.firstName}" loading="lazy" style="object-position: ${mainPos}" onerror="this.onerror=null">
                            ${hasSwap ? `<img class="back-face" src="${a.drbPhotoUrl}" alt="${a.firstName} DRB" loading="lazy" style="object-position: ${drbPos}" onerror="this.onerror=null">` : ''}
                        </div>
                        <div class="grid-card-body">
                            <h3>${a.firstName} ${a.lastName}</h3>
                            <p class="grid-year year-color-${a.gradYear % 4} text-colored">Class of ${a.gradYear}</p>
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

        let leafletMarkerCluster = null;

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

            // Setup or clear marker cluster group
            if (leafletMarkerCluster) {
                leafletMarkerCluster.clearLayers();
            } else {
                leafletMarkerCluster = L.markerClusterGroup({
                    maxClusterRadius: 45, // aggressively cluster nearby cities
                    spiderfyOnMaxZoom: true,
                    showCoverageOnHover: false,
                    zoomToBoundsOnClick: true
                });
                leafletMap.addLayer(leafletMarkerCluster);
            }

            // Group alumni by city for efficient geocoding
            const cityGroups = {};
            filteredAlumni.forEach(a => {
                if (!a.city) return;
                const cityKey = a.city.toLowerCase().replace(/,\s*(\w{2})$/i, '').replace(/,.*$/, '').trim();
                if (!cityGroups[cityKey]) cityGroups[cityKey] = { name: a.city, alumni: [] };
                cityGroups[cityKey].alumni.push(a);
            });

            const entries = Object.entries(cityGroups);
            const geocodePromises = [];

            for (const [key, group] of entries) {
                let coords = CITY_COORDS[key];
                if (coords) {
                    addMapMarkersToCluster(coords, group);
                } else {
                    geocodePromises.push(
                        geocodeCity(group.name).then(geoCoords => {
                            if (geoCoords) addMapMarkersToCluster(geoCoords, group);
                        })
                    );
                }
            }

            if (geocodePromises.length > 0) {
                await Promise.allSettled(geocodePromises);
            }

            updateMapSummary(filteredAlumni);
        }

        function addMapMarkersToCluster(coords, group) {
            // Spawn 1 individual marker per human so cluster math works perfectly
            group.alumni.forEach(a => {
                const marker = L.circleMarker(coords, {
                    radius: 8,
                    fillColor: '#7BAFD4',
                    color: '#ffffff',
                    weight: 1.5,
                    fillOpacity: 0.9
                });
                
                const avatar = a.photoUrl || generateAvatar(a.firstName, a.lastName, a.gradYear);
                const popupHtml = `
                    <div style="font-family:Inter,sans-serif; text-align:center;">
                        <img src="${avatar}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; margin-bottom:8px;">
                        <br>
                        <a href="#profile=${a.id}" style="color:#7BAFD4; text-decoration:none; font-weight:bold; font-size:1.1em;">${a.firstName} ${a.lastName}</a>
                        <div style="color:#6c757d; font-size:0.9em; margin-top:2px;">${a.occupation || 'Class of ' + a.gradYear}</div>
                        <div style="color:#6c757d; font-size:0.85em;">📍 ${a.city}</div>
                    </div>
                `;
                marker.bindPopup(popupHtml, { maxWidth: 250, minWidth: 150 });
                leafletMarkerCluster.addLayer(marker);
            });
        }

        function updateMapSummary(filteredAlumni) {
            const existing = document.querySelector('.map-summary');
            if (existing) existing.remove();

            // Calculate distinct cities by grouping them uniquely
            const mappedCities = new Set();
            let totalAlumni = 0;
            filteredAlumni.forEach(a => {
                if (a.city) {
                    mappedCities.add(a.city.toLowerCase().replace(/,\s*(\w{2})$/i, '').replace(/,.*$/, '').trim());
                    totalAlumni++;
                }
            });

            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'map-summary';
            summaryDiv.innerHTML = `<span>${mappedCities.size} cities</span> · <span>${totalAlumni} alumni mapped</span>`;
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

        function buildSpecialUniversityFilterGroups(alumni) {
            const groups = {
                [HBCU_FILTER_LABEL]: new Set(),
                [IVY_LEAGUE_FILTER_LABEL]: new Set(),
                [MEDICAL_SCHOOL_FILTER_LABEL]: new Set(),
                [LAW_SCHOOL_FILTER_LABEL]: new Set()
            };

            alumni.forEach(alum => {
                alum.educationHistory.forEach(edu => {
                    if (!edu.university) return;
                    if (HBCU_UNIVERSITY_SET.has(edu.university)) groups[HBCU_FILTER_LABEL].add(edu.university);
                    if (IVY_LEAGUE_UNIVERSITY_SET.has(edu.university)) groups[IVY_LEAGUE_FILTER_LABEL].add(edu.university);
                    if (edu.degrees.some(isMedicalSchoolDegree)) groups[MEDICAL_SCHOOL_FILTER_LABEL].add(edu.university);
                    if (edu.degrees.some(isLawSchoolDegree)) groups[LAW_SCHOOL_FILTER_LABEL].add(edu.university);
                });
            });

            return Object.fromEntries(
                Object.entries(groups)
                    .map(([label, values]) => [label, Array.from(values).sort()])
                    .filter(([, values]) => values.length > 0)
            );
        }

        function populateSpecialUniversityFilters(container, groups) {
            if (!container) return;
            container.innerHTML = '';

            Object.entries(groups).forEach(([label, universities]) => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'university-category-group special-university-group';

                const masterCheckboxId = `university-special-${label.replace(/\W/g, '-')}`;
                groupDiv.innerHTML = `
                    <label class="sub-filter-group master-university master-filter-control" for="${masterCheckboxId}" style="display:flex; width:100%; margin:0; cursor:pointer; font-weight:600;">
                        <input type="checkbox" id="${masterCheckboxId}" value="${label}" class="university-special-master">
                        <span class="custom-checkbox"></span>
                        <span class="filter-label-text">${label}</span>
                        <span class="arrow"></span>
                    </label>
                `;

                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'options-container university-special-options';

                universities.forEach(university => {
                    const subCheckboxId = `university-special-${label.replace(/\W/g, '-')}-${university.replace(/\W/g, '-')}`;
                    const subLabel = document.createElement('label');
                    subLabel.className = 'sub-filter-group master-filter-control';
                    subLabel.htmlFor = subCheckboxId;
                    subLabel.style.cssText = 'display:flex; width:100%; margin:0; cursor:pointer; font-weight:400; font-size:0.85em; color:var(--text-secondary);';
                    subLabel.innerHTML = `
                        <input type="checkbox" id="${subCheckboxId}" value="${label}::${university}" class="university-special-checkbox">
                        <span class="custom-checkbox"></span>
                        <span class="filter-label-text">${university}</span>
                    `;
                    optionsContainer.appendChild(subLabel);
                });

                groupDiv.appendChild(optionsContainer);
                container.appendChild(groupDiv);

                const masterCheckbox = groupDiv.querySelector('.university-special-master');
                const subCheckboxes = Array.from(groupDiv.querySelectorAll('.university-special-checkbox'));

                masterCheckbox?.addEventListener('change', () => {
                    subCheckboxes.forEach(checkbox => {
                        checkbox.checked = masterCheckbox.checked;
                    });
                    syncFilterHierarchy('university');
                    renderProfiles();
                });

                subCheckboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', () => {
                        masterCheckbox.checked = subCheckboxes.every(sub => sub.checked);
                        masterCheckbox.indeterminate = !masterCheckbox.checked && subCheckboxes.some(sub => sub.checked);
                        syncFilterHierarchy('university');
                        renderProfiles();
                    });
                });
            });
        }

        function bindFilterSidebarInteractions(root = document) {
            root.querySelectorAll('.master-filter-control').forEach(control => {
                if (control.dataset.bound === 'true') return;

                const checkbox = control.querySelector('input[type="checkbox"]');
                const labelText = control.querySelector('.filter-label-text');

                const toggleExpansion = () => {
                    const container = control.parentElement.querySelector(':scope > .options-container');
                    control.classList.toggle('expanded');
                    if (container) container.classList.toggle('expanded');
                };

                if (labelText) {
                    labelText.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleExpansion();
                    });
                }

                control.querySelector('.arrow')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleExpansion();
                });

                checkbox?.addEventListener('change', () => {
                    const isChecked = checkbox.checked;
                    if (isChecked && !control.classList.contains('expanded')) {
                        toggleExpansion();
                    }
                    if (!isChecked) {
                        if (control.classList.contains('expanded')) toggleExpansion();
                        control.parentElement.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                            if (cb !== checkbox) cb.checked = false;
                        });
                        control.parentElement.querySelectorAll('.options-container').forEach(c => c.classList.remove('expanded'));
                        control.parentElement.querySelectorAll('.master-filter-control').forEach(c => c.classList.remove('expanded'));
                    }
                    renderProfiles();
                });

                control.dataset.bound = 'true';
            });

            root.querySelectorAll('.options-container').forEach(container => {
                if (container.dataset.bound === 'true') return;
                container.addEventListener('click', (event) => { event.stopPropagation(); });
                container.dataset.bound = 'true';
            });
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

                const masterCheckboxId = `${itemType}-category-${category.replace(/\W/g, '-')}`;
                categoryDiv.innerHTML = `
                    <label class="sub-filter-group master-${itemType} master-filter-control" for="${masterCheckboxId}" style="display:flex; width:100%; margin:0; cursor:pointer; font-weight:600;">
                        <input type="checkbox" id="${masterCheckboxId}">
                        <span class="custom-checkbox"></span>
                        <span class="filter-label-text">${category}</span>
                    </label>
                `;
                
                const subOptionsContainer = document.createElement('div');
                subOptionsContainer.className = `${itemType}-sub-options`;
                
                itemsByCategory[category].sort().forEach(item => {
                    const subCheckboxId = `${itemType}-${item.replace(/\W/g, '-')}`;
                    const subLabel = document.createElement('label');
                    subLabel.className = 'sub-filter-group master-filter-control';
                    subLabel.htmlFor = subCheckboxId;
                    subLabel.style.cssText = 'display:flex; width:100%; margin:0; cursor:pointer; font-weight:400; font-size:0.85em; color:var(--text-secondary);';
                    subLabel.innerHTML = `
                        <input type="checkbox" id="${subCheckboxId}" value="${item}" class="${itemType}-sub-checkbox">
                        <span class="custom-checkbox"></span>
                        <span class="filter-label-text">${item}</span>
                    `;
                    subOptionsContainer.appendChild(subLabel);
                });

                categoryDiv.appendChild(subOptionsContainer);
                container.appendChild(categoryDiv);

                const masterCheckbox = categoryDiv.querySelector(`#${masterCheckboxId}`);
                const subCheckboxes = Array.from(categoryDiv.querySelectorAll(`.${itemType}-sub-checkbox`));

                masterCheckbox.addEventListener('change', () => {
                    subCheckboxes.forEach(sub => sub.checked = masterCheckbox.checked);
                    syncFilterHierarchy(itemType);
                    renderProfiles();
                });

                subCheckboxes.forEach(sub => {
                    sub.addEventListener('change', () => {
                        masterCheckbox.checked = subCheckboxes.every(s => s.checked);
                        masterCheckbox.indeterminate = !masterCheckbox.checked && subCheckboxes.some(s => s.checked);
                        syncFilterHierarchy(itemType);
                        renderProfiles();
                    });
                });
            });
        }

        function syncFilterHierarchy(itemType) {
            const mappings = {
                'university': {
                    subMaster: 'university-sub-filter',
                    subSelectors: [
                        '#university-options-container input:checked',
                        '#university-tag-options-container input:checked'
                    ],
                    rootMaster: 'education-master-filter',
                    rootSelectors: [
                        '#university-options-container input:checked',
                        '#university-tag-options-container input:checked',
                        '#major-options-container input:checked',
                        '#degree-options-container input:checked',
                        '#greek-options-container input:checked'
                    ]
                },
                'major': {
                    subMaster: 'major-sub-filter',
                    subSelectors: ['#major-options-container input:checked'],
                    rootMaster: 'education-master-filter',
                    rootSelectors: [
                        '#university-options-container input:checked',
                        '#major-options-container input:checked',
                        '#degree-options-container input:checked',
                        '#greek-options-container input:checked'
                    ]
                },
                'degree': {
                    subMaster: 'degree-sub-filter',
                    subSelectors: ['#degree-options-container input:checked'],
                    rootMaster: 'education-master-filter',
                    rootSelectors: [
                        '#university-options-container input:checked',
                        '#major-options-container input:checked',
                        '#degree-options-container input:checked',
                        '#greek-options-container input:checked'
                    ]
                },
                'greek': {
                    subMaster: 'greek-sub-filter',
                    subSelectors: ['#greek-options-container input:checked'],
                    rootMaster: 'education-master-filter',
                    rootSelectors: [
                        '#university-options-container input:checked',
                        '#major-options-container input:checked',
                        '#degree-options-container input:checked',
                        '#greek-options-container input:checked'
                    ]
                },
                'drb-awards': {
                    subMaster: 'drb-awards-sub-filter',
                    subSelectors: ['#drb-awards-options-container input:checked'],
                    rootMaster: 'honorees-master-filter',
                    rootSelectors: [
                        '#drb-awards-options-container input:checked',
                        '#drb-leadership-options-container input:checked'
                    ]
                },
                'drb-leadership': {
                    subMaster: 'drb-leadership-sub-filter',
                    subSelectors: ['#drb-leadership-options-container input:checked'],
                    rootMaster: 'honorees-master-filter',
                    rootSelectors: [
                        '#drb-awards-options-container input:checked',
                        '#drb-leadership-options-container input:checked'
                    ]
                },
                'industry': {
                    subMaster: 'industry-sub-filter',
                    subSelectors: ['#industry-options-container input:checked'],
                    rootMaster: 'career-master-filter',
                    rootSelectors: [
                        '#industry-options-container input:checked',
                        '#military-options-container input:checked'
                    ]
                },
                'military': {
                    subMaster: 'military-sub-filter',
                    subSelectors: ['#military-options-container input:checked'],
                    rootMaster: 'career-master-filter',
                    rootSelectors: [
                        '#industry-options-container input:checked',
                        '#military-options-container input:checked'
                    ]
                },
                'class-year': {
                    rootMaster: 'class-year-master-filter',
                    rootSelectors: ['#class-year-options-container input:checked']
                },
                'location': {
                    rootMaster: 'location-master-filter',
                    rootSelectors: ['#location-options-container input:checked']
                }
            };

            const config = mappings[itemType];
            if (!config) return;

            if (config.subMaster) {
                const subMasterCheckbox = document.getElementById(config.subMaster);
                if (subMasterCheckbox) {
                    subMasterCheckbox.checked = config.subSelectors.some(selector => document.querySelector(selector));
                }
            }

            if (config.rootMaster) {
                const rootMasterCheckbox = document.getElementById(config.rootMaster);
                if (rootMasterCheckbox) {
                    rootMasterCheckbox.checked = config.rootSelectors.some(selector => document.querySelector(selector));
                }
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            const supabase = window.supabaseClient;
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
            const filterModeUnionBtn = document.getElementById('filter-mode-union-btn');
            const filterModeIntersectionBtn = document.getElementById('filter-mode-intersection-btn');
            const requestAccessBtn = document.getElementById('request-access-btn');
            const requestAccessNote = document.querySelector('.request-access-note');
            const requestAccessModal = document.getElementById('request-access-modal-overlay');
            const requestAccessForm = document.getElementById('request-access-form');
            const requestAccessMessage = document.getElementById('request-access-message');
            const requestAccessSubmitBtn = document.getElementById('request-access-submit-btn');
            const requestAccessCloseBtn = document.getElementById('request-access-close-btn');
            const requestAccessCancelBtn = document.getElementById('request-access-cancel-btn');
            const requestEmailInput = document.getElementById('request-email');
            const defaultLoginDescription = "Use the email tied to your profile and we'll send a quick code to sign you in.";
            const requestStateSelect = document.getElementById('request-state');
            const requestMilitaryBranchSelect = document.getElementById('request-military-branch');
            const requestGreekInput = document.getElementById('request-greek');
            const requestGreekOptions = document.getElementById('request-greek-options');
            const addEducationEntryBtn = document.getElementById('add-education-entry-btn');
            const requestEducationEntries = document.getElementById('request-education-entries');
            const requestEducationEntryTemplate = document.getElementById('request-education-entry-template');
            const requestUniversityOptions = document.getElementById('request-university-options');
            const requestMajorOptions = document.getElementById('request-major-options');
            const requestDegreeOptions = document.getElementById('request-degree-options');
            const requestOccupationOptions = document.getElementById('request-occupation-options');
            const requestPhotoCurrentInput = document.getElementById('request-photo-current');
            const requestPhotoDrbInput = document.getElementById('request-photo-drb');
            const requestPhotoCurrentPreview = document.getElementById('request-photo-current-preview');
            const requestPhotoDrbPreview = document.getElementById('request-photo-drb-preview');
            const requestLocationResults = document.getElementById('request-location-results');
            const defaultRequestAccessNoteText = requestAccessNote ? requestAccessNote.textContent : '';
            const requestShareNone = document.getElementById('request-share-none');
            const requestShareEmail = document.getElementById('request-share-email');
            const requestSharePhone = document.getElementById('request-share-phone');
            const requestShareSocial = document.getElementById('request-share-social');
            const populatePublicDatalists = async () => {
                try {
                    const [{ data: education }, { data: majorsData }] = await Promise.all([
                        supabase.from('alumni_education').select('university, degree'),
                        supabase.from('education_majors').select('major_name')
                    ]);

                    const occupations = new Set([
                        'Accounting', 'Arts & Design', 'Business Development', 'Consulting',
                        'Data Science', 'Education', 'Engineering', 'Entrepreneurship / Founder',
                        'Finance', 'Government & Public Administration', 'Healthcare',
                        'Human Resources', 'Information Technology', 'Legal', 'Marketing',
                        'Media & Communications', 'Non-Profit', 'Operations',
                        'Product Management', 'Real Estate', 'Research', 'Sales',
                        'Software Engineering', 'Venture Capital & Private Equity'
                    ]);
                    const universities = new Set();
                    const degrees = new Set();
                    const majors = new Set();

                    (education || []).forEach(row => {
                        if (row.university) row.university.split('\n').map(s => s.trim()).filter(Boolean).forEach(s => universities.add(s));
                        if (row.degree) row.degree.split('\n').map(s => s.trim()).filter(Boolean).forEach(s => degrees.add(s));
                    });

                    (majorsData || []).forEach(row => {
                        if (row.major_name) row.major_name.split('\n').map(s => s.trim()).filter(Boolean).forEach(s => majors.add(s));
                    });

                    const populate = (element, items) => {
                        if (element) {
                            element.innerHTML = Array.from(items).sort().map(item => `<option value="${item}">`).join('');
                        }
                    };

                    populate(requestOccupationOptions, occupations);
                    populate(requestUniversityOptions, universities);
                    populate(requestDegreeOptions, degrees);
                    populate(requestMajorOptions, majors);
                } catch (e) {
                    console.error('Error prefetching datalist data:', e);
                }
            };
            populatePublicDatalists();

            const setRequestAccessMessage = (message = '', type = '') => {
                if (!requestAccessMessage) return;
                requestAccessMessage.textContent = message;
                requestAccessMessage.className = 'edit-message';
                if (type) requestAccessMessage.classList.add(type);
            };

            const openRequestAccessModal = () => {
                if (!requestAccessModal) return;
                
                requestAccessForm?.reset();
                if (typeof resetEducationEntries === 'function') resetEducationEntries();
                if (typeof resetRequestLinkEntries === 'function') resetRequestLinkEntries();
                
                const requestLocationField = document.getElementById('request-location');
                if (requestLocationField && typeof setupLocationAutocomplete === 'function') {
                    setupLocationAutocomplete(requestLocationField, document.getElementById('request-location-results'));
                }
                
                if (typeof clearRequestUploadPreview === 'function') {
                    clearRequestUploadPreview(document.getElementById('request-photo-current-preview'));
                    clearRequestUploadPreview(document.getElementById('request-photo-drb-preview'));
                }

                setRequestAccessMessage('');
                requestAccessModal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
            };

            const openRequestAccessFromLogin = emailValue => {
                if (requestEmailInput && !requestEmailInput.value.trim() && emailValue) {
                    requestEmailInput.value = String(emailValue).trim().toLowerCase();
                }
                openRequestAccessModal();
            };

            const closeRequestAccessModal = () => {
                if (!requestAccessModal) return;
                requestAccessModal.style.display = 'none';
                document.body.style.overflow = '';
            };

            const getRequestFieldValue = (formData, fieldName) => String(formData.get(fieldName) || '')
                .replace(/\r\n/g, '\n')
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/[\u2013\u2014]/g, '-')
                .split('\n')
                .map(line => line.replace(/\s+/g, ' ').trim())
                .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
                .join('\n')
                .trim();

            const formatRequestFileSize = bytes => {
                if (!bytes) return '0 KB';
                if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                return `${Math.max(1, Math.round(bytes / 1024))} KB`;
            };

            const getCheckedRequestValues = name =>
                Array.from(requestAccessForm?.querySelectorAll(`input[name="${name}"]:checked`) || [])
                    .map(input => canonicalizeText(input.value))
                    .filter(Boolean);

            const populateRequestDatalist = (datalist, options) => {
                if (!datalist) return;
                datalist.innerHTML = '';
                options.forEach(optionValue => {
                    const option = document.createElement('option');
                    option.value = optionValue;
                    datalist.appendChild(option);
                });
            };

            const populateRequestSelect = (select, options, placeholder) => {
                if (!select) return;
                select.innerHTML = '';
                const placeholderOption = document.createElement('option');
                placeholderOption.value = '';
                placeholderOption.textContent = placeholder;
                select.appendChild(placeholderOption);

                options.forEach(optionValue => {
                    const option = document.createElement('option');
                    option.value = optionValue;
                    option.textContent = optionValue;
                    select.appendChild(option);
                });
            };

            const toTitleCase = value => String(value || '')
                .split(/\s+/)
                .filter(Boolean)
                .map(part => part.length <= 3 && part === part.toUpperCase()
                    ? part
                    : part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ');

            const parseLocationDisplayParts = display => {
                const parts = String(display || '')
                    .split(',')
                    .map(part => part.trim())
                    .filter(Boolean);

                if (!parts.length) {
                    return { city: '', state: '' };
                }

                if (parts.length === 1) {
                    return { city: parts[0], state: '' };
                }

                return {
                    city: parts.slice(0, -1).join(', '),
                    state: parts[parts.length - 1]
                };
            };

            const getRequestUniversitySuggestionList = query => {
                const normalizedQuery = query.trim().toLowerCase();
                if (normalizedQuery.length < 2) return [];
                const optionValues = requestUniversityOptions
                    ? Array.from(requestUniversityOptions.querySelectorAll('option')).map(option => option.value)
                    : [];
                const suggestionPool = [...new Set([...REQUEST_UNIVERSITY_OPTIONS, ...optionValues].filter(Boolean))];

                return suggestionPool
                    .filter(value => value.toLowerCase().includes(normalizedQuery))
                    .sort((a, b) => {
                        const aStarts = a.toLowerCase().startsWith(normalizedQuery);
                        const bStarts = b.toLowerCase().startsWith(normalizedQuery);
                        if (aStarts !== bStarts) return aStarts ? -1 : 1;
                        return a.localeCompare(b);
                    })
                    .slice(0, 8);
            };

            const getLocalLocationSuggestionList = query => {
                const normalizedQuery = query.trim().toLowerCase();
                if (normalizedQuery.length < 2) return [];

                const localLocations = new Set();
                allAlumniData.forEach(alumnus => {
                    const display = [alumnus.city, alumnus.state].filter(Boolean).join(', ');
                    if (display) localLocations.add(display);
                });
                Object.keys(CITY_COORDS || {}).forEach(cityKey => {
                    localLocations.add(toTitleCase(cityKey));
                });

                return Array.from(localLocations)
                    .filter(location => location.toLowerCase().includes(normalizedQuery))
                    .sort((a, b) => {
                        const aStarts = a.toLowerCase().startsWith(normalizedQuery);
                        const bStarts = b.toLowerCase().startsWith(normalizedQuery);
                        if (aStarts !== bStarts) return aStarts ? -1 : 1;
                        return a.localeCompare(b);
                    })
                    .slice(0, 6);
            };

            const setupLocationAutocomplete = (input, resultsEl) => {
                if (!input || !resultsEl || input.dataset.autocompleteBound === 'true') return;
                let debounce = null;

                const clearResults = () => {
                    resultsEl.innerHTML = '';
                };

                input.addEventListener('input', () => {
                    clearTimeout(debounce);
                    const query = input.value.trim();
                    if (query.length < 2) {
                        clearResults();
                        return;
                    }

                    debounce = setTimeout(() => {
                        const matches = getLocalLocationSuggestionList(query);
                        clearResults();
                        matches.forEach(match => {
                            const button = document.createElement('button');
                            button.type = 'button';
                            button.className = 'autocomplete-result-btn';
                            button.textContent = match;
                            button.addEventListener('click', () => {
                                input.value = match;
                                clearResults();
                            });
                            resultsEl.appendChild(button);
                        });
                    }, 180);
                });

                document.addEventListener('click', event => {
                    if (!input.contains(event.target) && !resultsEl.contains(event.target)) {
                        clearResults();
                    }
                });

                input.dataset.autocompleteBound = 'true';
            };

            const updateEducationEntryControls = () => {
                if (!requestEducationEntries) return;
                const entries = Array.from(requestEducationEntries.querySelectorAll('.request-education-entry'));
                entries.forEach((entry, index) => {
                    const title = entry.querySelector('.request-entry-title');
                    const removeBtn = entry.querySelector('.request-entry-remove');
                    if (title) title.textContent = `School ${index + 1}`;
                    if (removeBtn) removeBtn.disabled = entries.length === 1;
                });
            };

            const addEducationEntry = (values = {}) => {
                if (!requestEducationEntries || !requestEducationEntryTemplate) return;
                const fragment = requestEducationEntryTemplate.content.cloneNode(true);
                const entry = fragment.querySelector('.request-education-entry');
                
                const uniInput = entry.querySelector('.request-education-university');
                uniInput.value = values.university || '';
                
                // Wire up university auto-suggest for Request Form
                const uniSuggestions = entry.querySelector('.request-uni-suggestions');
                let uniDebounce = null;
                uniInput.addEventListener('input', () => {
                    clearTimeout(uniDebounce);
                    const q = uniInput.value.trim();
                    if (q.length < 2) { uniSuggestions.innerHTML = ''; return; }
                    uniDebounce = setTimeout(() => {
                        uniSuggestions.innerHTML = '';
                        getRequestUniversitySuggestionList(q).forEach(name => {
                            const li = document.createElement('li');
                            li.textContent = name;
                            li.addEventListener('click', () => {
                                uniInput.value = name;
                                uniSuggestions.innerHTML = '';
                            });
                            uniSuggestions.appendChild(li);
                        });
                    }, 300);
                });
                document.addEventListener('click', (e) => {
                    if (!uniInput.contains(e.target) && !uniSuggestions.contains(e.target)) {
                        uniSuggestions.innerHTML = '';
                    }
                });

                entry.querySelector('.request-education-major').value = values.major || '';
                entry.querySelector('.request-education-degree').value = values.degree || '';
                entry.querySelector('.request-education-grad-year').value = values.gradYear || '';
                entry.querySelector('.request-entry-remove').addEventListener('click', () => {
                    entry.remove();
                    updateEducationEntryControls();
                });
                requestEducationEntries.appendChild(fragment);
                updateEducationEntryControls();
            };

            const resetEducationEntries = () => {
                if (!requestEducationEntries) return;
                requestEducationEntries.innerHTML = '';
                addEducationEntry();
            };

            const serializeEducationEntries = () => {
                if (!requestEducationEntries) {
                    return {
                        education_university: '',
                        education_major: '',
                        education_degree: '',
                        education_grad_year: ''
                    };
                }

                const entries = Array.from(requestEducationEntries.querySelectorAll('.request-education-entry'))
                    .map(entry => ({
                        university: canonicalizeText(entry.querySelector('.request-education-university')?.value || ''),
                        major: canonicalizeText(entry.querySelector('.request-education-major')?.value || ''),
                        degree: canonicalizeText(entry.querySelector('.request-education-degree')?.value || ''),
                        gradYear: canonicalizeText(entry.querySelector('.request-education-grad-year')?.value || '')
                    }))
                    .filter(entry => entry.university || entry.major || entry.degree || entry.gradYear);

                return {
                    education_university: entries.map(entry => entry.university).join('\n'),
                    education_major: entries.map(entry => entry.major).join('\n'),
                    education_degree: entries.map(entry => entry.degree).join('\n'),
                    education_grad_year: entries.map(entry => entry.gradYear).join('\n')
                };
            };

            const clearRequestUploadPreview = previewEl => {
                if (!previewEl) return;
                if (previewEl.dataset.objectUrl) {
                    URL.revokeObjectURL(previewEl.dataset.objectUrl);
                    delete previewEl.dataset.objectUrl;
                }
                previewEl.hidden = true;
                const image = previewEl.querySelector('img');
                const name = previewEl.querySelector('.request-upload-name');
                const size = previewEl.querySelector('.request-upload-size');
                if (image) image.src = '';
                if (name) name.textContent = '';
                if (size) size.textContent = '';
            };

            const updateRequestUploadPreview = (fileInput, previewEl) => {
                if (!previewEl) return;
                clearRequestUploadPreview(previewEl);
                const file = fileInput?.files?.[0];
                if (!file) return;

                const objectUrl = URL.createObjectURL(file);
                previewEl.dataset.objectUrl = objectUrl;
                const image = previewEl.querySelector('img');
                const name = previewEl.querySelector('.request-upload-name');
                const size = previewEl.querySelector('.request-upload-size');
                if (image) image.src = objectUrl;
                if (name) name.textContent = file.name;
                if (size) size.textContent = formatRequestFileSize(file.size);
                previewEl.hidden = false;
            };

            const requestLinksEntries = document.getElementById('request-links-entries');
            const requestLinkEntryTemplate = document.getElementById('request-link-entry-template');

            const addRequestLinkEntry = (values = {}) => {
                if (!requestLinksEntries || !requestLinkEntryTemplate) return;
                const fragment = requestLinkEntryTemplate.content.cloneNode(true);
                const entry = fragment.querySelector('.request-link-entry');
                entry.querySelector('.request-link-platform').value = values.platform || 'LinkedIn';
                entry.querySelector('.request-link-url').value = values.url || '';
                entry.querySelector('.request-link-remove').addEventListener('click', () => {
                    entry.remove();
                });
                requestLinksEntries.appendChild(fragment);
            };

            const resetRequestLinkEntries = () => {
                if (!requestLinksEntries) return;
                requestLinksEntries.innerHTML = '';
                addRequestLinkEntry(); // Add one default blank row
            };

            const serializeRequestLinkEntries = () => {
                if (!requestLinksEntries) return { social_media: '' };

                const entries = Array.from(requestLinksEntries.querySelectorAll('.request-link-entry'))
                    .map(entry => ({
                        platform: canonicalizeText(entry.querySelector('.request-link-platform')?.value || ''),
                        url: (entry.querySelector('.request-link-url')?.value || '').trim()
                    }))
                    .filter(entry => entry.url);

                return {
                    social_media: entries.map(e => `${e.platform}: ${e.url}`).join(' | ')
                };
            };

            document.getElementById('add-request-link-btn')?.addEventListener('click', () => addRequestLinkEntry());

            const loadImageFile = file => new Promise((resolve, reject) => {
                const objectUrl = URL.createObjectURL(file);
                const image = new Image();
                image.onload = () => {
                    URL.revokeObjectURL(objectUrl);
                    resolve(image);
                };
                image.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    reject(new Error(`Could not read ${file.name} as an image.`));
                };
                image.src = objectUrl;
            });

            const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (!blob) {
                        reject(new Error('Image compression failed.'));
                        return;
                    }
                    resolve(blob);
                }, type, quality);
            });

            const blobToBase64 = blob => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = String(reader.result || '');
                    resolve(result.includes(',') ? result.split(',')[1] : result);
                };
                reader.onerror = () => reject(new Error('Image encoding failed.'));
                reader.readAsDataURL(blob);
            });

            const sanitizeAttachmentName = (fileName, fallbackBase) => {
                const base = (fileName || fallbackBase || 'photo')
                    .replace(/\.[^.]+$/, '')
                    .replace(/[^a-z0-9-_]+/gi, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '')
                    .toLowerCase();
                return `${base || fallbackBase || 'photo'}.jpg`;
            };

            const buildRequestImageAttachment = async (fileInput, role, fallbackName) => {
                const file = fileInput?.files?.[0];
                if (!file) return null;
                if (!file.type || !file.type.startsWith('image/')) {
                    throw new Error(`${role} must be an image file.`);
                }

                // 4MB strict limit for raw uploads to prevent Apps Script payload crashes
                const maxAttachmentBytes = 4 * 1024 * 1024;
                if (file.size > maxAttachmentBytes) {
                    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
                    throw new Error(`${role} is too large (${sizeMb}MB). Please select a photo under 4MB.`);
                }

                return {
                    role,
                    name: sanitizeAttachmentName(file.name, fallbackName),
                    mimeType: file.type,
                    data: await blobToBase64(file)
                };
            };

            const resetRequestAccessFormState = () => {
                if (requestAccessForm) requestAccessForm.reset();
                if (requestAccessNote) requestAccessNote.textContent = defaultRequestAccessNoteText;
                clearRequestUploadPreview(requestPhotoCurrentPreview);
                clearRequestUploadPreview(requestPhotoDrbPreview);
                resetEducationEntries();
                if (requestStateSelect) requestStateSelect.value = '';
                if (requestMilitaryBranchSelect) requestMilitaryBranchSelect.value = '';
                if (requestGreekInput) requestGreekInput.value = '';
            };

            const syncRequestShareControls = changedCheckbox => {
                if (!changedCheckbox) return;
                if (changedCheckbox === requestShareNone && requestShareNone.checked) {
                    [requestShareEmail, requestSharePhone, requestShareSocial].forEach(checkbox => {
                        if (checkbox) checkbox.checked = false;
                    });
                    return;
                }

                if (changedCheckbox !== requestShareNone && changedCheckbox.checked && requestShareNone) {
                    requestShareNone.checked = false;
                }
            };

            populateRequestSelect(requestStateSelect, REQUEST_STATE_OPTIONS, 'Select a state');


            populateRequestSelect(requestMilitaryBranchSelect, REQUEST_MILITARY_BRANCH_OPTIONS, 'Select a branch');
            populateRequestDatalist(requestGreekOptions, REQUEST_GREEK_OPTIONS);
            populateRequestDatalist(requestUniversityOptions, REQUEST_UNIVERSITY_OPTIONS);
            populateRequestDatalist(requestMajorOptions, REQUEST_MAJOR_OPTIONS);
            populateRequestDatalist(requestDegreeOptions, REQUEST_DEGREE_OPTIONS);
            populateRequestDatalist(requestOccupationOptions, REQUEST_OCCUPATION_OPTIONS);
            resetEducationEntries();

            if (addEducationEntryBtn) {
                addEducationEntryBtn.addEventListener('click', () => addEducationEntry());
            }

            if (requestPhotoCurrentInput) {
                requestPhotoCurrentInput.addEventListener('change', () => updateRequestUploadPreview(requestPhotoCurrentInput, requestPhotoCurrentPreview));
            }

            if (requestPhotoDrbInput) {
                requestPhotoDrbInput.addEventListener('change', () => updateRequestUploadPreview(requestPhotoDrbInput, requestPhotoDrbPreview));
            }

            [requestShareEmail, requestSharePhone, requestShareSocial, requestShareNone].forEach(checkbox => {
                checkbox?.addEventListener('change', () => syncRequestShareControls(checkbox));
            });

            if (requestAccessBtn) {
                requestAccessBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openRequestAccessModal();
                });
            }

            if (requestAccessCloseBtn) {
                requestAccessCloseBtn.addEventListener('click', closeRequestAccessModal);
            }

            if (requestAccessCancelBtn) {
                requestAccessCancelBtn.addEventListener('click', closeRequestAccessModal);
            }

            // Click-outside-to-close behavior removed per user feedback
            // if (requestAccessModal) {
            //     requestAccessModal.addEventListener('click', (event) => {
            //         if (event.target === requestAccessModal) closeRequestAccessModal();
            //     });
            // }

            if (requestAccessForm) {
                requestAccessForm.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    if (!requestAccessForm.reportValidity()) return;

                    const formData = new FormData(requestAccessForm);
                    const educationPayload = serializeEducationEntries();
                    const leadership = [
                        ...getCheckedRequestValues('leadership_option'),
                        canonicalizeText(formData.get('leadership_other') || '')
                    ].filter(Boolean).join('\n');
                    const awards = [
                        ...getCheckedRequestValues('award_option'),
                        canonicalizeText(formData.get('awards_other') || '')
                    ].filter(Boolean).join('\n');
                    const locParts = (formData.get('location') || '').split(',').map(s => s.trim());
                    const reqCity = locParts.length > 0 ? (locParts.length > 1 ? locParts.slice(0, -1).join(', ') : locParts[0]) : '';
                    const reqState = locParts.length > 1 ? locParts[locParts.length - 1] : '';

                    const linkPayload = serializeRequestLinkEntries();

                    const payload = {
                        first_name: getRequestFieldValue(formData, 'first_name'),
                        last_name: getRequestFieldValue(formData, 'last_name'),
                        grad_year: getRequestFieldValue(formData, 'grad_year'),
                        email: getRequestFieldValue(formData, 'email').toLowerCase(),
                        phone: getRequestFieldValue(formData, 'phone'),
                        city: reqCity,
                        state: reqState,
                        occupation: getRequestFieldValue(formData, 'occupation'),
                        education_university: educationPayload.education_university,
                        education_major: educationPayload.education_major,
                        education_degree: educationPayload.education_degree,
                        education_grad_year: educationPayload.education_grad_year,
                        greek_affiliation: getRequestFieldValue(formData, 'greek_affiliation'),
                        tenure: getRequestFieldValue(formData, 'tenure'),
                        leadership,
                        awards,
                        favorite_step: getRequestFieldValue(formData, 'favorite_step'),
                        military_branch: getRequestFieldValue(formData, 'military_branch'),
                        military_rank: getRequestFieldValue(formData, 'military_rank'),
                        about: getRequestFieldValue(formData, 'about'),
                        instagram: getRequestFieldValue(formData, 'instagram'),
                        social_media: linkPayload.social_media,
                        websites: '',
                        contact_for_events: canonicalizeText(formData.get('contact_for_events') || ''),
                        share_email: !!requestAccessForm.elements.share_email.checked && !requestAccessForm.elements.share_none.checked,
                        share_phone: !!requestAccessForm.elements.share_phone.checked && !requestAccessForm.elements.share_none.checked,
                        share_social: !!requestAccessForm.elements.share_social.checked && !requestAccessForm.elements.share_none.checked,
                        review_notes: getRequestFieldValue(formData, 'review_notes'),
                        source_url: window.location.href,
                        submitted_at: new Date().toISOString()
                    };

                    try {
                        if (requestAccessSubmitBtn) {
                            requestAccessSubmitBtn.disabled = true;
                            requestAccessSubmitBtn.textContent = 'Preparing...';
                        }
                        setRequestAccessMessage('Preparing your request and attachments...');

                        const attachments = (await Promise.all([
                            buildRequestImageAttachment(requestPhotoCurrentInput, 'Current Photo', 'current-photo'),
                            buildRequestImageAttachment(requestPhotoDrbInput, 'DRB Photo', 'drb-photo')
                        ])).filter(Boolean);

                        payload.current_photo_filename = attachments.find(attachment => attachment.role === 'Current Photo')?.name || '';
                        payload.drb_photo_filename = attachments.find(attachment => attachment.role === 'DRB Photo')?.name || '';
                        payload.attachments = attachments;

                        if (requestAccessSubmitBtn) {
                            requestAccessSubmitBtn.textContent = 'Sending...';
                        }
                        setRequestAccessMessage('Sending your request for approval...');

                        const response = await fetch(APPS_SCRIPT_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'text/plain;charset=utf-8'
                            },
                            body: JSON.stringify({
                                action: 'request_access',
                                request: payload
                            })
                        });

                        const rawResponse = await response.text();
                        let result;

                        try {
                            result = JSON.parse(rawResponse);
                        } catch (parseError) {
                            throw new Error('Unexpected response from the request service.');
                        }

                        if (!response.ok || !result.success) {
                            throw new Error(result?.error || `Request failed with status ${response.status}.`);
                        }

                        resetRequestAccessFormState();
                        setRequestAccessMessage('Request sent successfully. We will review it before enabling login access.', 'success');
                        if (requestAccessNote) {
                            requestAccessNote.textContent = 'Request received. Approval is still required before login is enabled.';
                        }

                        window.setTimeout(() => {
                            closeRequestAccessModal();
                            setRequestAccessMessage('');
                        }, 1400);
                    } catch (error) {
                        console.error('Error submitting access request:', error);
                        setRequestAccessMessage(`Error sending request: ${error.message}`, 'error');
                    } finally {
                        if (requestAccessSubmitBtn) {
                            requestAccessSubmitBtn.disabled = false;
                            requestAccessSubmitBtn.textContent = 'Send Request';
                        }
                    }
                });
            }

            if (!supabase?.auth) {
                if (loginBtn) loginBtn.disabled = true;
                if (verifyBtn) verifyBtn.disabled = true;
                if (loginMessage) {
                    const initError = window.supabaseInitError;
                    const isFileProtocol = window.location.protocol === 'file:';
                    const detail = initError?.message ? ` (${initError.message})` : '';
                    loginMessage.textContent = isFileProtocol
                        ? `Authentication failed to initialize. Open this app through a local web server instead of file://.${detail}`
                        : `Authentication failed to initialize. Please verify the Supabase script and keys.${detail}`;
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
                    setFilterMode('union', false);
                    renderProfiles();
                });
            }

    function setFilterMode(mode, shouldRender = true) {
        currentFilterMode = mode === 'intersection' ? 'intersection' : 'union';
        if (filterModeUnionBtn) {
            filterModeUnionBtn.classList.toggle('active', currentFilterMode === 'union');
            filterModeUnionBtn.setAttribute('aria-pressed', String(currentFilterMode === 'union'));
        }
        if (filterModeIntersectionBtn) {
            filterModeIntersectionBtn.classList.toggle('active', currentFilterMode === 'intersection');
            filterModeIntersectionBtn.setAttribute('aria-pressed', String(currentFilterMode === 'intersection'));
        }
        if (shouldRender) renderCurrentView();
    }

    if (filterModeUnionBtn) {
        filterModeUnionBtn.addEventListener('click', () => {
            if (currentFilterMode !== 'union') setFilterMode('union');
        });
    }

    if (filterModeIntersectionBtn) {
        filterModeIntersectionBtn.addEventListener('click', () => {
            if (currentFilterMode !== 'intersection') setFilterMode('intersection');
        });
    }

    setFilterMode(currentFilterMode, false);

    function renderProfiles() {
        const searchInput = document.getElementById('search-input');
        currentSearchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
        renderCurrentView();
    }

    async function loadDataFromSupabase() {
        if (!loadingMessage) return;
        loadingMessage.style.display = 'block';
        loadingMessage.textContent = 'Loading data...';
        allAlumniData = [];
        allowedEmails = new Set();
        await Promise.all([loadContactPreferences(), loadGreekAffiliations()]);
        
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
                    alumni_education (
                        *,
                        education_majors (*)
                    ),
                    alumni_links (*),
                    alumni_awards (*),
                    alumni_leadership (*)
                `);

            if (error) throw error;

            allAlumniData = data.map(alum => {
                const educationRows = Array.isArray(alum.alumni_education) ? alum.alumni_education : [];
                const linkRows = Array.isArray(alum.alumni_links) ? alum.alumni_links : [];
                const awardRows = Array.isArray(alum.alumni_awards) ? alum.alumni_awards : [];
                const leadershipRows = Array.isArray(alum.alumni_leadership) ? alum.alumni_leadership : [];
                const alumnusKey = getAlumnusKey(alum.first_name, alum.last_name, alum.grad_year);
                const fallbackConsent = contactPreferences[alumnusKey] || { email: false, phone: false, social: false };
                const consent = {
                    email: coerceOptionalBoolean(alum.share_email) ?? !!fallbackConsent.email,
                    phone: coerceOptionalBoolean(alum.share_phone) ?? !!fallbackConsent.phone,
                    social: coerceOptionalBoolean(alum.share_social) ?? !!fallbackConsent.social
                };
                const canViewPrivateContact = currentUserEmail === 'admin@drb.network' || (
                    alum.email &&
                    currentUserEmail &&
                    alum.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()
                );
                const visibleEmail = canViewPrivateContact || consent.email ? alum.email : null;
                const visiblePhone = canViewPrivateContact || consent.phone ? alum.phone : null;
                const visibleSocial = canViewPrivateContact || consent.social;
                const allSocialMedia = linkRows
                    .filter(l => l.link_type === 'social' || l.is_social === true)
                    .map(l => ({
                        type: l.label || l.type || l.display_text || 'Social',
                        url: l.url,
                        display: l.display_text || l.label || l.type || l.url
                    }))
                    .filter(l => l.url && l.type.toLowerCase() !== 'instagram');
                const allWebsites = linkRows
                    .filter(l => l.link_type === 'website' || l.is_social === false)
                    .map(l => ({
                        type: l.label || l.type || l.display_text || 'Website',
                        url: l.url,
                        display: l.display_text || l.label || l.type || l.url
                    }))
                    .filter(l => l.url);
                const rawInstagram = (linkRows.find(l => {
                    const label = (l.label || l.type || l.display_text || '').toLowerCase();
                    return label === 'instagram';
                })?.url) || '';

                const record = {
                    id: alum.id,
                    firstName: alum.first_name,
                    lastName: alum.last_name,
                    gradYear: String(alum.grad_year),
                    rawPhotoUrl: alum.photo_url || '',
                    photoUrl: alum.photo_url || alum.drb_photo_url || defaultProfilePic,
                    drbPhotoUrl: alum.drb_photo_url,
                    city: alum.city,
                    state: alum.state,
                    occupation: alum.occupation,
                    industry: alum.industry,
                    tenure: alum.tenure,
                    favoriteStep: alum.favorite_step,
                    about: alum.about,
                    greekAffiliation: normalizeGreekAffiliation(alum.greek_affiliation || greekAffiliations[alumnusKey] || ''),
                    email: visibleEmail,
                    phone: visiblePhone,
                    rawEmail: alum.email,
                    rawPhone: alum.phone,
                    militaryBranch: alum.military_branch,
                    militaryRank: alum.military_rank,
                    fullName: `${alum.first_name} ${alum.last_name}`,
                    fullNameForLogin: (alum.first_name + alum.last_name).replace(/\s/g, '').toLowerCase(),
                    educationHistory: educationRows.map(e => {
                        const majorRows = Array.isArray(e.education_majors) ? e.education_majors : [];
                        const normalizedUniversity = normalizeName(e.university, universityNormalizationMap);
                        const majors = majorRows.length > 0
                            ? majorRows.map(m => ({
                                original: m.major_name,
                                normalized: normalizeName(m.major_name, majorNormalizationMap)
                            })).filter(m => m.normalized)
                            : (e.major ? [{ original: e.major, normalized: normalizeName(e.major, majorNormalizationMap) }] : []);
                        const degreeInfo = e.degree_level
                            ? { degrees: [e.degree_level], degreeLevels: [e.degree_level] }
                            : parseDegreeInfo(e.degree);

                        return {
                            university: normalizedUniversity || canonicalizeText(e.university),
                            majors,
                            degrees: degreeInfo.degrees,
                            degreeLevels: degreeInfo.degreeLevels,
                            gradYear: e.grad_year ? String(e.grad_year) : ''
                        };
                    }),
                    awards: [...new Set(awardRows.map(a => normalizeAwardName(a.award_name)).filter(Boolean))],
                    leadershipPositions: leadershipRows.map(l => l.position_name).filter(Boolean),
                    socialMedia: visibleSocial ? allSocialMedia : [],
                    rawSocialMedia: allSocialMedia,
                    websites: allWebsites,
                    instagram: visibleSocial ? rawInstagram : '',
                    rawInstagram,
                    consent
                };

                record.instagramHandle = record.instagram
                    ? record.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')
                    : '';
                record.instagramUrl = record.instagram
                    ? (/^https?:\/\//i.test(record.instagram) ? record.instagram : `https://instagram.com/${record.instagram.replace(/^@/, '')}`)
                    : '';
                record.hasEducation = record.educationHistory.length > 0;
                record.hasMilitaryService = !!(record.militaryBranch || record.militaryRank);
                record.hasRealPhoto = !!(record.rawPhotoUrl || record.drbPhotoUrl);
                record.industries = extractIndustryTags(record.occupation, record.industry);
                record.industry = record.industries[0] || '';

                record.universities = [...new Set(record.educationHistory.map(e => e.university).filter(Boolean))];
                record.majors = [...new Set(record.educationHistory.flatMap(e => e.majors.map(m => m.normalized)).filter(Boolean))];
                record.hasHBCU = record.universities.some(university => HBCU_UNIVERSITY_SET.has(university));
                record.hasIvyLeague = record.universities.some(university => IVY_LEAGUE_UNIVERSITY_SET.has(university));
                record.hasMedicalSchool = record.educationHistory.some(edu => edu.degrees.some(isMedicalSchoolDegree));
                record.hasLawSchool = record.educationHistory.some(edu => edu.degrees.some(isLawSchoolDegree));

                // Removed early return
                if (record.rawEmail) allowedEmails.add(record.rawEmail.toLowerCase().trim());
                
                sets.classYears.add(record.gradYear);
                if (record.militaryBranch) sets.military.add(record.militaryBranch);
                if (record.greekAffiliation) sets.greek.add(record.greekAffiliation);
                record.awards.forEach(a => sets.awards.add(a));
                record.leadershipPositions.forEach(l => sets.leadership.add(l));

                record.educationHistory.forEach(edu => {
                   if (edu.university) {
                       sets.universities[edu.university] = universityToStateMap[edu.university] || 'Other';
                   }
                   edu.majors.forEach(m => {
                       if (m.normalized) sets.majors.add(m.normalized);
                   });
                   edu.degreeLevels.forEach(level => sets.degreeLevels.add(level));
                });

                record.industries.forEach(industryTag => {
                    sets.industries[industryTag] = occupationToCategory[industryTag] || 'Other';
                });
                if (record.state) sets.locations.add(record.state);
                return record;
            });

            loadingMessage.style.display = 'none';
            if (loginMessage) loginMessage.textContent = '';
            if (loginBtn) loginBtn.disabled = false;

            const populateFilter = (container, items, prefix, sortFn) => {
                if (!container) return;
                container.innerHTML = '';
                const sortedItems = sortFn ? [...items].sort(sortFn) : [...items].sort();
                 sortedItems.forEach(item => {
                    const labelDiv = document.createElement('label');
                    labelDiv.className = 'sub-filter-group master-filter-control';
                    labelDiv.htmlFor = `${prefix}-${item.replace(/\W/g, '-')}`;
                    labelDiv.style.cssText = 'display:flex; width:100%; margin:0; cursor:pointer; font-weight:400; font-size:0.85em; color:var(--text-secondary);';
                    const checkboxId = `${prefix}-${item.replace(/\W/g, '-')}`;
                    labelDiv.innerHTML = `<input type="checkbox" id="${checkboxId}" value="${item}"><span class="custom-checkbox"></span><span class="filter-label-text">${item}</span>`;
                    container.appendChild(labelDiv);
                    labelDiv.querySelector('input').addEventListener('change', () => {
                        syncFilterHierarchy(prefix);
                        renderProfiles();
                    });
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
            populateSpecialUniversityFilters(
                document.getElementById('university-tag-options-container'),
                buildSpecialUniversityFilterGroups(allAlumniData)
            );
            populateHierarchicalFilter(document.getElementById('major-options-container'), Object.fromEntries([...sets.majors].map(m => [m, majorToCategory[m] || 'Other'])), 'major');
            populateHierarchicalFilter(document.getElementById('industry-options-container'), sets.industries, 'industry');
            populateFilter(document.getElementById('degree-options-container'), sets.degreeLevels, 'degree', customDegreeSort);
            populateFilter(document.getElementById('location-options-container'), sets.locations, 'location');
            bindFilterSidebarInteractions(document.getElementById('filter-panel'));
            
            window.addEventListener('hashchange', router);
            window.addEventListener('resize', renderProfiles);
            renderCurrentView();
        } catch (error) {
            console.error('Error loading data from Supabase:', error);
            if (loadingMessage) {
                loadingMessage.textContent = `Error loading data: ${error.message || 'Please refresh.'}`;
            }
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
                emailStep.style.display = 'grid';
                otpStep.style.display = 'none';
                document.getElementById('login-description').textContent = defaultLoginDescription;
                loginEmailInput.value = '';
                loginOtpInput.value = '';
                loginMessage.textContent = '';
                otpMessage.textContent = '';
                loginMessage.classList.remove('error');
                otpMessage.classList.remove('error');
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
                    loginMessage.textContent = 'Checking your access...';
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
                        const normalizedError = String(error.message || '').toLowerCase();
                        const isNotApprovedError = normalizedError === 'user not found' || normalizedError.includes('signups not allowed for otp');
                        loginMessage.textContent = isNotApprovedError
                            ? "We couldn't find an approved account for this email yet. You can request access below and we'll take a look."
                            : 'Error: ' + error.message;
                        loginMessage.classList.add('error');
                        loginBtn.disabled = false;

                        if (isNotApprovedError) {
                            openRequestAccessFromLogin(rawInput);
                        }
                    } else {
                        currentUserEmail = rawInput;
                        emailStep.style.display = 'none';
                        otpStep.style.display = 'grid';
                        document.getElementById('login-description').textContent = 'Enter the code we just sent to ' + currentUserEmail + '.';
                        otpMessage.textContent = 'Check your inbox for your sign-in code.';
                        otpMessage.classList.remove('error');
                    }
                });
            }

            if (verifyBtn) {
                verifyBtn.addEventListener('click', async () => {
                    const codeInput = loginOtpInput.value.trim();
                    if (!codeInput || codeInput.length < 6) {
                        otpMessage.textContent = 'Enter the full code from your email.';
                        otpMessage.classList.add('error');
                        return;
                    }

                    otpMessage.textContent = 'Signing you in...';
                    otpMessage.classList.remove('error');
                    verifyBtn.disabled = true;

                    const { data, error } = await supabase.auth.verifyOtp({
                        email: currentUserEmail,
                        token: codeInput,
                        type: 'email'
                    });

                    if (error) {
                        otpMessage.textContent = "That code didn't work. Try again or request a new one.";
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
            const viewMyProfileBtn = document.getElementById('view-my-profile-btn');
            if (viewMyProfileBtn) {
                viewMyProfileBtn.addEventListener('click', () => {
                   if (!currentUserEmail) return;
                   const myProfile = allAlumniData.find(a => String(a.email).toLowerCase() === String(currentUserEmail).toLowerCase());
                   if (myProfile) {
                       window.location.hash = '#profile=' + myProfile.id;
                   } else {
                       alert('Your profile details could not be found. Please ensure your email is fully registered.');
                   }
                });
            }
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
                    document.getElementById('email-step').style.display = 'grid';
                    document.getElementById('otp-step').style.display = 'none';
                    document.getElementById('login-description').textContent = defaultLoginDescription;
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
            const editEducationEntries = document.getElementById('edit-education-entries');
            const editLinksEntries = document.getElementById('edit-links-entries');
            const editLocationInput = document.getElementById('edit-location');
            const editLocationSuggestions = document.getElementById('edit-location-suggestions');
            const editCityHidden = document.getElementById('edit-city');
            const editStateHidden = document.getElementById('edit-state');
            let editingAlumnus = null;

            // --- Location Auto-Suggest (Local suggestions) ---
            let locationDebounce = null;
            if (editLocationInput) {
                editLocationInput.addEventListener('input', () => {
                    clearTimeout(locationDebounce);
                    // Clear stale city/state when user manually edits
                    editCityHidden.value = '';
                    editStateHidden.value = '';
                    const query = editLocationInput.value.trim();
                    if (query.length < 2) {
                        editLocationSuggestions.innerHTML = '';
                        return;
                    }
                    locationDebounce = setTimeout(() => {
                        const results = getLocalLocationSuggestionList(query);
                        editLocationSuggestions.innerHTML = '';
                        results.forEach(location => {
                            const li = document.createElement('li');
                            li.textContent = location;
                            li.addEventListener('click', () => {
                                const parsed = parseLocationDisplayParts(location);
                                editLocationInput.value = location;
                                editCityHidden.value = parsed.city;
                                editStateHidden.value = parsed.state;
                                editLocationSuggestions.innerHTML = '';
                            });
                            editLocationSuggestions.appendChild(li);
                        });
                    }, 400);
                });

                // Close dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('#edit-location') && !e.target.closest('#edit-location-suggestions')) {
                        editLocationSuggestions.innerHTML = '';
                    }
                });
            }

            // --- Dynamic Education Entries (Edit Modal) ---
            const LINK_TYPE_OPTIONS = ['Instagram', 'LinkedIn', 'Twitter / X', 'Facebook', 'Website', 'Other'];

            function addEditEducationEntry(values = {}) {
                if (!editEducationEntries) return;
                const entry = document.createElement('div');
                entry.className = 'request-education-entry';
                entry.innerHTML = `
                    <div class="request-entry-header">
                        <span class="request-entry-title">School</span>
                        <button type="button" class="btn-secondary request-entry-remove">Remove</button>
                    </div>
                    <div class="request-form-grid">
                        <div class="form-group request-span-2" style="position:relative;">
                            <label>University</label>
                            <input type="text" class="edit-edu-university" autocomplete="off" placeholder="Start typing a university..." value="${escapeHTML(values.university || '')}">
                            <ul class="location-suggestions edit-uni-suggestions"></ul>
                        </div>
                        <div class="form-group request-span-2">
                            <label>Major</label>
                            <input type="text" class="edit-edu-major" list="request-major-options" autocomplete="off" placeholder="Mechanical Engineering" value="${escapeHTML(values.major || '')}">
                        </div>
                        <div class="form-group">
                            <label>Degree</label>
                            <input type="text" class="edit-edu-degree" list="request-degree-options" autocomplete="off" placeholder="Bachelor of Science" value="${escapeHTML(values.degree || '')}">
                        </div>
                        <div class="form-group">
                            <label>Graduation Year</label>
                            <input type="number" class="edit-edu-grad-year" min="1970" max="2100" placeholder="2028" value="${escapeHTML(values.gradYear || '')}">
                        </div>
                    </div>
                `;

                // Wire up university auto-suggest
                const uniInput = entry.querySelector('.edit-edu-university');
                const uniSuggestions = entry.querySelector('.edit-uni-suggestions');
                let uniDebounce = null;
                uniInput.addEventListener('input', () => {
                    clearTimeout(uniDebounce);
                    const q = uniInput.value.trim();
                    if (q.length < 2) { uniSuggestions.innerHTML = ''; return; }
                    uniDebounce = setTimeout(() => {
                        uniSuggestions.innerHTML = '';
                        getRequestUniversitySuggestionList(q).forEach(name => {
                            const li = document.createElement('li');
                            li.textContent = name;
                            li.addEventListener('click', () => {
                                uniInput.value = name;
                                uniSuggestions.innerHTML = '';
                            });
                            uniSuggestions.appendChild(li);
                        });
                    }, 300);
                });
                // Close on outside click
                document.addEventListener('click', (e) => {
                    if (!uniInput.contains(e.target) && !uniSuggestions.contains(e.target)) {
                        uniSuggestions.innerHTML = '';
                    }
                });

                entry.querySelector('.request-entry-remove').addEventListener('click', () => {
                    entry.remove();
                    updateEditEducationControls();
                });
                editEducationEntries.appendChild(entry);
                updateEditEducationControls();
            }

            function updateEditEducationControls() {
                if (!editEducationEntries) return;
                const entries = Array.from(editEducationEntries.querySelectorAll('.request-education-entry'));
                entries.forEach((entry, i) => {
                    const title = entry.querySelector('.request-entry-title');
                    const removeBtn = entry.querySelector('.request-entry-remove');
                    if (title) title.textContent = `School ${i + 1}`;
                    if (removeBtn) removeBtn.disabled = entries.length === 1;
                });
            }

            function serializeEditEducationEntries() {
                if (!editEducationEntries) return [];
                return Array.from(editEducationEntries.querySelectorAll('.request-education-entry'))
                    .map(entry => ({
                        university: (entry.querySelector('.edit-edu-university')?.value || '').trim(),
                        major: (entry.querySelector('.edit-edu-major')?.value || '').trim(),
                        degree: (entry.querySelector('.edit-edu-degree')?.value || '').trim(),
                        gradYear: (entry.querySelector('.edit-edu-grad-year')?.value || '').trim()
                    }))
                    .filter(e => e.university || e.major || e.degree || e.gradYear);
            }

            document.getElementById('edit-add-education-btn')?.addEventListener('click', () => addEditEducationEntry());

            // --- Dynamic Link Entries (Edit Modal) ---
            function addEditLinkEntry(values = {}) {
                if (!editLinksEntries) return;
                const entry = document.createElement('div');
                entry.className = 'edit-link-entry';
                const typeOptions = LINK_TYPE_OPTIONS.map(t => {
                    const sel = (values.type || '').toLowerCase() === t.toLowerCase() ? 'selected' : '';
                    return `<option value="${t}" ${sel}>${t}</option>`;
                }).join('');
                entry.innerHTML = `
                    <select class="edit-link-type">${typeOptions}</select>
                    <input type="text" class="edit-link-url" placeholder="@handle or https://..." value="${escapeHTML(values.url || '')}">
                    <button type="button" class="edit-link-remove">✕</button>
                `;
                entry.querySelector('.edit-link-remove').addEventListener('click', () => entry.remove());
                editLinksEntries.appendChild(entry);
            }

            function serializeEditLinkEntries() {
                if (!editLinksEntries) return [];
                return Array.from(editLinksEntries.querySelectorAll('.edit-link-entry'))
                    .map(entry => ({
                        type: (entry.querySelector('.edit-link-type')?.value || '').trim(),
                        url: (entry.querySelector('.edit-link-url')?.value || '').trim()
                    }))
                    .filter(e => e.url);
            }

            document.getElementById('edit-add-link-btn')?.addEventListener('click', () => addEditLinkEntry());

            // --- Photo Upload Previews ---
            const editPhotoFile = document.getElementById('edit-photo-file');
            const editDrbPhotoFile = document.getElementById('edit-drb-photo-file');

            function setupPhotoPreview(fileInput, previewId, previewImgId, previewNameId, previewSizeId) {
                if (!fileInput) return;
                fileInput.addEventListener('change', () => {
                    const file = fileInput.files[0];
                    const preview = document.getElementById(previewId);
                    const previewImg = document.getElementById(previewImgId);
                    const previewName = document.getElementById(previewNameId);
                    const previewSize = document.getElementById(previewSizeId);
                    if (file) {
                        preview.hidden = false;
                        previewImg.src = URL.createObjectURL(file);
                        previewName.textContent = file.name;
                        previewSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
                    } else {
                        preview.hidden = true;
                    }
                });
            }

            setupPhotoPreview(editPhotoFile, 'edit-photo-preview', 'edit-photo-preview-img', 'edit-photo-preview-name', 'edit-photo-preview-size');
            setupPhotoPreview(editDrbPhotoFile, 'edit-drb-photo-preview', 'edit-drb-photo-preview-img', 'edit-drb-photo-preview-name', 'edit-drb-photo-preview-size');

            async function uploadPhotoToSupabase(file, alumnusId, prefix) {
                const ext = file.name.split('.').pop().toLowerCase();
                const path = `${alumnusId}/${prefix}.${ext}`;
                // Remove old file first (ignore errors)
                await supabase.storage.from('profile-photos').remove([path]);
                const { error } = await supabase.storage.from('profile-photos').upload(path, file, {
                    cacheControl: '3600',
                    upsert: true
                });
                if (error) throw new Error(`Photo upload failed: ${error.message}`);
                const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path);
                return urlData.publicUrl;
            }


            // --- Open Edit Modal ---
            window.openEditModal = function(alumnus) {
                editingAlumnus = alumnus;
                const isAdmin = currentUserEmail === 'admin@drb.network';
                document.getElementById('admin-edit-fields').style.display = isAdmin ? 'block' : 'none';
                document.getElementById('edit-firstname').value = alumnus.firstName || '';
                document.getElementById('edit-lastname').value = alumnus.lastName || '';
                document.getElementById('edit-classyear').value = alumnus.gradYear || '';
                document.getElementById('edit-email').value = alumnus.email || '';

                // Location
                const locationDisplay = [alumnus.city, alumnus.state].filter(Boolean).join(', ');
                editLocationInput.value = locationDisplay;
                editCityHidden.value = alumnus.city || '';
                editStateHidden.value = alumnus.state || '';

                document.getElementById('edit-occupation').value = alumnus.occupation || '';
                document.getElementById('edit-phone').value = alumnus.phone || '';
                document.getElementById('edit-about').value = alumnus.about || '';

                // Populate dynamic education entries
                editEducationEntries.innerHTML = '';
                if (alumnus.educationHistory && alumnus.educationHistory.length > 0) {
                    alumnus.educationHistory.forEach(edu => {
                        addEditEducationEntry({
                            university: edu.university || '',
                            major: edu.majors.map(m => m.original || m.normalized).join(', '),
                            degree: edu.degrees ? edu.degrees.join(', ') : '',
                            gradYear: edu.gradYear || ''
                        });
                    });
                } else {
                    addEditEducationEntry();
                }

                // Populate dynamic link entries
                editLinksEntries.innerHTML = '';
                // Instagram
                if (alumnus.rawInstagram) {
                    addEditLinkEntry({ type: 'Instagram', url: alumnus.instagramHandle || alumnus.rawInstagram });
                }
                // Social media
                if (alumnus.rawSocialMedia && alumnus.rawSocialMedia.length > 0) {
                    alumnus.rawSocialMedia.forEach(s => {
                        const typeLabel = (s.type || '').toLowerCase();
                        if (typeLabel === 'instagram') return; // already added above
                        let matchedType = LINK_TYPE_OPTIONS.find(opt => opt.toLowerCase() === typeLabel) || 'Other';
                        addEditLinkEntry({ type: matchedType, url: s.url });
                    });
                }
                // Websites
                if (alumnus.websites && alumnus.websites.length > 0) {
                    alumnus.websites.forEach(w => {
                        addEditLinkEntry({ type: 'Website', url: w.url });
                    });
                }
                // Ensure at least one empty link row
                if (editLinksEntries.children.length === 0) {
                    addEditLinkEntry();
                }

                // Reset photo inputs
                if (editPhotoFile) { editPhotoFile.value = ''; document.getElementById('edit-photo-preview').hidden = true; }
                if (editDrbPhotoFile) { editDrbPhotoFile.value = ''; document.getElementById('edit-drb-photo-preview').hidden = true; }

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
            // Click-outside-to-close behavior removed per user feedback
            // editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!editingAlumnus || !currentUserEmail) return;

                const saveBtn = document.getElementById('modal-save-btn');
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                editMessage.textContent = '';

                const alumnusId = editingAlumnus.id;

                try {
                    // 0. Upload photos if provided
                    const photoFile = editPhotoFile?.files[0];
                    const drbPhotoFile = editDrbPhotoFile?.files[0];
                    let photoUrl = null;
                    let drbPhotoUrl = null;

                    if (photoFile) {
                        saveBtn.textContent = 'Uploading photo...';
                        photoUrl = await uploadPhotoToSupabase(photoFile, alumnusId, 'photo');
                    }
                    if (drbPhotoFile) {
                        saveBtn.textContent = 'Uploading DRB photo...';
                        drbPhotoUrl = await uploadPhotoToSupabase(drbPhotoFile, alumnusId, 'drb_photo');
                    }

                    saveBtn.textContent = 'Saving...';

                    // Parse raw location input if user didn't click auto-suggest
                    const locVal = editLocationInput.value.trim();
                    let finalCity = editCityHidden.value.trim();
                    let finalState = editStateHidden.value.trim();
                    
                    if (locVal) {
                        const expectedDisplay = [finalCity, finalState].filter(Boolean).join(', ');
                        if (locVal !== expectedDisplay) {
                            const parts = locVal.split(',').map(s => s.trim());
                            finalCity = parts[0] || '';
                            finalState = parts.slice(1).join(', ') || '';
                        }
                    } else {
                        finalCity = ''; finalState = '';
                    }

                    // 1. Update main alumni record
                    const updates = {
                        city: finalCity,
                        state: finalState,
                        occupation: document.getElementById('edit-occupation').value.trim(),
                        phone: document.getElementById('edit-phone').value.trim(),
                        about: document.getElementById('edit-about').value.trim(),
                        ...(photoUrl ? { photo_url: photoUrl } : {}),
                        ...(drbPhotoUrl ? { drb_photo_url: drbPhotoUrl } : {})
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

                    const { error: alumniError } = await supabase
                        .from('alumni')
                        .update(updates)
                        .eq('id', alumnusId);
                    if (alumniError) throw alumniError;

                    // 2. Sync education (delete old, insert new)
                    // First get existing education IDs to delete their majors
                    const { data: existingEdu } = await supabase
                        .from('alumni_education')
                        .select('id')
                        .eq('alumnus_id', alumnusId);
                    
                    if (existingEdu && existingEdu.length > 0) {
                        const eduIds = existingEdu.map(e => e.id);
                        const { error: delMajorsErr } = await supabase.from('education_majors').delete().in('education_id', eduIds);
                        if (delMajorsErr) throw new Error('Failed to update majors: ' + delMajorsErr.message);
                    }
                    const { error: delEduErr } = await supabase.from('alumni_education').delete().eq('alumnus_id', alumnusId);
                    if (delEduErr) throw new Error('Failed to update education: ' + delEduErr.message);

                    const educationEntries = serializeEditEducationEntries();
                    for (const edu of educationEntries) {
                        const { data: newEdu, error: eduInsertErr } = await supabase
                            .from('alumni_education')
                            .insert({
                                alumnus_id: alumnusId,
                                university: edu.university,
                                degree: edu.degree,
                                grad_year: edu.gradYear ? parseInt(edu.gradYear) : null
                            })
                            .select('id')
                            .single();
                        if (eduInsertErr) throw new Error('Failed to save education: ' + eduInsertErr.message);

                        // Insert majors
                        if (edu.major && newEdu) {
                            const majors = edu.major.split(',').map(m => m.trim()).filter(Boolean);
                            if (majors.length > 0) {
                                const { error: majInsertErr } = await supabase.from('education_majors').insert(
                                    majors.map(m => ({ education_id: newEdu.id, major_name: m }))
                                );
                                if (majInsertErr) throw new Error('Failed to save majors: ' + majInsertErr.message);
                            }
                        }
                    }

                    // 3. Sync links (delete old, insert new)
                    const { error: delLinksErr } = await supabase.from('alumni_links').delete().eq('alumnus_id', alumnusId);
                    if (delLinksErr) throw new Error('Failed to update links: ' + delLinksErr.message);

                    const linkEntries = serializeEditLinkEntries();
                    const linkInserts = linkEntries.map(link => {
                        const typeLower = link.type.toLowerCase();
                        let url = link.url;
                        let label = link.type;
                        let linkType = 'social';
                        let isSocial = true;

                        if (typeLower === 'instagram') {
                            // Normalize @handle to full URL
                            const handle = url.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
                            url = `https://instagram.com/${handle}`;
                            label = 'Instagram';
                        } else if (typeLower === 'website' || typeLower === 'other') {
                            linkType = 'website';
                            isSocial = false;
                        }

                        return {
                            alumnus_id: alumnusId,
                            type: label,
                            url: url,
                            display_text: label,
                            is_social: isSocial
                        };
                    });

                    if (linkInserts.length > 0) {
                        const { error: linkErr } = await supabase.from('alumni_links').insert(linkInserts);
                        if (linkErr) throw new Error('Failed to save links: ' + linkErr.message);
                    }

                    editMessage.textContent = '✓ Profile updated successfully!';
                    editMessage.className = 'edit-message success';
                    
                    loadDataFromSupabase(); // Refresh local data
                    
                    setTimeout(() => {
                        closeEditModal();
                        router();
                    }, 1200);
                } catch (err) {
                    console.error('Update error:', err);
                    editMessage.textContent = 'Error: ' + err.message;
                    editMessage.className = 'edit-message error';
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Changes';
                }
            });

            bindFilterSidebarInteractions(document.getElementById('filter-panel'));

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
