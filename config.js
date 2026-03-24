// --- Data Normalization Maps ---
const stateAbbreviationMap = { 'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming' };
const countryCodeMap = { 'SK': 'South Korea' };

const universityNormalizationMap = {
    'university of maryland, college park': 'University of Maryland, College Park', 'university of maryland': 'University of Maryland, College Park', 'umd': 'University of Maryland, College Park', 'umdcp': 'University of Maryland, College Park',
    'university of maryland, baltimore county': 'University of Maryland, Baltimore County', 'university of maryland baltimore county': 'University of Maryland, Baltimore County', 'umbc': 'University of Maryland, Baltimore County',
    'st. mary\'s college of maryland': 'St. Mary\'s College of Maryland', 'st marys college of maryland': 'St. Mary\'s College of Maryland', 'st. mary\'s': 'St. Mary\'s College of Maryland', 'st marys': 'St. Mary\'s College of Maryland',
    'umgc': 'University of Maryland Global Campus', 'university maryland global campus': 'University of Maryland Global Campus',
    'morgan state university': 'Morgan State University', 'morgan state': 'Morgan State University',
    'johns hopkins university': 'Johns Hopkins University', 'johns hopkins': 'Johns Hopkins University',
    'howard university': 'Howard University', 'howard': 'Howard University',
    'georgetown university': 'Georgetown University', 'georgetown': 'Georgetown University',
    'hampton university': 'Hampton University', 'hampton': 'Hampton University',
    'cornell university': 'Cornell University', 'cornell': 'Cornell University',
    'brown university': 'Brown University', 'brown': 'Brown University',
    'columbia university': 'Columbia University', 'columbia': 'Columbia University',
    'dartmouth college': 'Dartmouth College', 'dartmouth': 'Dartmouth College',
    'harvard university': 'Harvard University', 'harvard': 'Harvard University',
    'princeton university': 'Princeton University', 'princeton': 'Princeton University',
    'yale university': 'Yale University', 'yale': 'Yale University',
    'ucla': 'University of California, Los Angeles',
    'university of california san francisco': 'University of California, San Francisco',
    'nyu': 'New York University', 'mit': 'Massachusetts Institute of Technology', 'usc': 'University of Southern California',
    'psu': 'Pennsylvania State University', 'penn state university': 'Pennsylvania State University', 'penn state': 'Pennsylvania State University',
    'tuskegee university': 'Tuskegee University', 'tuskegee': 'Tuskegee University',
    'bowie state university': 'Bowie State University', 'bowie state': 'Bowie State University',
    'city university of new york': 'City University of New York', 'cuny': 'City University of New York',
    'drexel university': 'Drexel University', 'drexel': 'Drexel University',
    'boston college': 'Boston College',
    'university of pennsylvania': 'University of Pennsylvania', 'upenn': 'University of Pennsylvania', 'penn': 'University of Pennsylvania',
    'george washington university': 'George Washington University', 'gwu': 'George Washington University',
    'towson university': 'Towson University', 'towson': 'Towson University',
    'florida a&m university': 'Florida A&M University', 'florida a&m': 'Florida A&M University', 'famu': 'Florida A&M University',
    'north carolina a&t state university': 'North Carolina A&T State University', 'north carolina a&t': 'North Carolina A&T State University', 'nca&t': 'North Carolina A&T State University',
    'university of north carolina at chapel hill': 'University of North Carolina at Chapel Hill', 'unc chapel hill': 'University of North Carolina at Chapel Hill', 'unc-chapel hill': 'University of North Carolina at Chapel Hill',
    'wake forest university': 'Wake Forest University'
};

const universityToStateMap = {
    'University of Maryland, College Park': 'Maryland', 'University of Maryland, Baltimore County': 'Maryland', 'St. Mary\'s College of Maryland': 'Maryland', 'St Mary\'s College of Maryland': 'Maryland', 'Towson University': 'Maryland', 'Bowie State University': 'Maryland', 'Morgan State University': 'Maryland', 'Johns Hopkins University': 'Maryland', 'University of Maryland Global Campus': 'Maryland', 'Loyola University Maryland': 'Maryland', 'Goucher College': 'Maryland', 'Mount St. Mary\'s University': 'Maryland', 'Stevenson University': 'Maryland', 'McDaniel College': 'Maryland', 'Hood College': 'Maryland', 'Salisbury University': 'Maryland',
    'Howard University': 'District of Columbia', 'Georgetown University': 'District of Columbia', 'American University': 'District of Columbia', 'George Washington University': 'District of Columbia',
    'Hampton University': 'Virginia', 'George Mason University': 'Virginia', 'Virginia Tech': 'Virginia', 'University of Virginia': 'Virginia',
    'Cornell University': 'New York', 'Columbia University': 'New York', 'City University of New York': 'New York', 'New York University': 'New York',
    'University of California, Los Angeles': 'California', 'University of California, San Francisco': 'California', 'University of Southern California': 'California',
    'Massachusetts Institute of Technology': 'Massachusetts', 'Boston College': 'Massachusetts', 'Harvard University': 'Massachusetts',
    'Pennsylvania State University': 'Pennsylvania', 'Drexel University': 'Pennsylvania', 'University of Pennsylvania': 'Pennsylvania', 'Princeton University': 'New Jersey',
    'Tuskegee University': 'Alabama',
    'Spelman College': 'Georgia', 'Morehouse College': 'Georgia', 'Clark Atlanta University': 'Georgia',
    'Florida A&M University': 'Florida',
    'North Carolina A&T State University': 'North Carolina', 'University of North Carolina at Chapel Hill': 'North Carolina', 'Wake Forest University': 'North Carolina',
    'Brown University': 'Rhode Island', 'Dartmouth College': 'New Hampshire', 'Yale University': 'Connecticut'
};

const hbcuList = [
    'Bowie State University', 'Morgan State University', 'Howard University', 'Hampton University',
    'Tuskegee University', 'Spelman College', 'Morehouse College', 'Clark Atlanta University',
    'Florida A&M University', 'North Carolina A&T State University'
];

const ivyLeagueList = [
    'Brown University', 'Columbia University', 'Cornell University', 'Dartmouth College',
    'Harvard University', 'Princeton University', 'University of Pennsylvania', 'Yale University'
];

const majorNormalizationMap = {
    'bio': 'Biology', 'chem': 'Chemistry', 'cs': 'Computer Science', 'comp sci': 'Computer Science',
    'poli sci': 'Political Science', 'government': 'Political Science', 'psychology': 'Psychology', 'psych': 'Psychology', 'envi sci': 'Environmental Science', 'economics': 'Economics', 'econ': 'Economics',
    'bioengineering': 'Bioengineering', 'architectural engineering': 'Architectural Engineering', 'architecture': 'Architecture', 'chemical engineering': 'Chemical Engineering', 'civil engineering': 'Civil Engineering', 'environmental engineering': 'Environmental Engineering', 'materials science and engineering': 'Materials Science and Engineering',
    'computer engineering': 'Computer Engineering', 'electrical engineering': 'Electrical Engineering', 'mechanical engineering': 'Mechanical Engineering', 'mechatronics engineer': 'Mechatronics Engineering', 'mechatronics engineering': 'Mechatronics Engineering',
    'accounting': 'Accounting', 'business administration': 'Business', 'business': 'Business',
    'finance': 'Finance', 'marketing': 'Marketing', 'management': 'Management', 'operations management': 'Operations Management', 'project management': 'Project Management', 'project management - engineering systems': 'Project Management - Engineering Systems', 'entrepreneurship & innovation': 'Entrepreneurship & Innovation', 'communications': 'Communications', 'media': 'Communications', 'journalism': 'Journalism',
    'criminology & criminal justice': 'Criminology', 'criminal justice': 'Criminology', 'criminology': 'Criminology', 'history': 'History',
    'information science': 'Information Science', 'information systems': 'Information Systems', 'linguistics': 'Linguistics', 'writing minor': 'Writing', 'writing': 'Writing',
    'english lang and literature': 'English', 'english': 'English', 'international studies': 'International Studies',
    'medicine': 'Medicine', 'nursing': 'Nursing', 'pathology': 'Pathology', 'pharmacy': 'Pharmacy', 'basic biomedical sciences': 'Basic Biomedical Sciences',
    'biology': 'Biology', 'biochemistry': 'Biochemistry', 'astrophysics': 'Astrophysics', 'neuroscience': 'Neuroscience',
    'studio art': 'Art', 'art': 'Art', 'film': 'Film', 'jazz studies': 'Jazz Studies',
    'applied math': 'Applied Mathematics'
};

const majorHierarchy = {
    'Engineering': ['Bioengineering', 'Architectural Engineering', 'Chemical Engineering', 'Civil Engineering', 'Computer Engineering', 'Electrical Engineering', 'Environmental Engineering', 'Mechanical Engineering', 'Mechatronics Engineering', 'Materials Science and Engineering', 'Project Management - Engineering Systems'],
    'Business & Economics': ['Accounting', 'Business', 'Economics', 'Entrepreneurship & Innovation', 'Finance', 'Management', 'Marketing', 'Operations Management', 'Project Management'],
    'Sciences': ['Astrophysics', 'Biochemistry', 'Biology', 'Chemistry', 'Environmental Science', 'Physics', 'Neuroscience', 'Applied Mathematics'],
    'Humanities & Social Sciences': ['Anthropology', 'Communications', 'Criminology', 'English', 'History', 'International Studies', 'Journalism', 'Linguistics', 'Political Science', 'Psychology', 'Sociology', 'Writing'],
    'Computer Science & IT': ['Computer Science', 'Information Science', 'Information Systems'],
    'Health & Medicine': ['Basic Biomedical Sciences', 'Medicine', 'Nursing', 'Pathology', 'Pharmacy'],
    'Arts': ['Art', 'Film', 'Jazz Studies', 'Music', 'Theatre'],
    'Design & Architecture': ['Architecture']
};

const majorToCategory = {};
for (const category in majorHierarchy) {
    for (const major of majorHierarchy[category]) { majorToCategory[major] = category; }
}

const occupationNormalizationMap = {
    'software engineering': 'Software Engineering',
    'software engineer': 'Software Engineering', 'developer': 'Software Engineering',
    'information technology': 'Information Technology', 'it': 'Information Technology',
    'ai & machine learning': 'AI & Machine Learning', 'tech - ai': 'AI & Machine Learning', 'academia - language, neuroscience, ai': 'AI & Machine Learning',
    'data science': 'Data Science', 'data scientist': 'Data Science', 'data analytics': 'Data Science',
    'doctor': 'Healthcare Professional', 'physician': 'Healthcare Professional', 'nurse': 'Healthcare Professional', 'medical': 'Healthcare Professional', 'neuroscience': 'Neuroscience Research', 'biopharmaceuticals': 'Biotech & Pharma', 'infectious disease clinical pharmacist': 'Healthcare Professional', 'internal medicine resident physician': 'Healthcare Professional',
    'healthcare professional': 'Healthcare Professional', 'neuroscience research': 'Neuroscience Research', 'biotech & pharma': 'Biotech & Pharma', 'biological sciences': 'Scientific Research', 'scientific research': 'Scientific Research',
    'lawyer': 'Law', 'attorney': 'Law',
    'law': 'Law',
    'recruiter': 'Recruiting & HR', 'recruiting & hr': 'Recruiting & HR',
    'business & finance': 'Business & Finance', 'consultant': 'Business & Finance', 'finance': 'Business & Finance', 'analyst': 'Business & Finance', 'accounting': 'Business & Finance', 'commodity analyst': 'Business & Finance',
    'teacher': 'Education', 'professor': 'Education', 'academia': 'Education', 'coach': 'Education', 'education': 'Education',
    'general engineering': 'General Engineering', 'engineer': 'General Engineering', 'engineering': 'General Engineering', 'mechatronics': 'Mechatronics Engineering', 'mechatronics engineering': 'Mechatronics Engineering', 'chemical engineering': 'General Engineering', 'mechanical engineering': 'General Engineering', 'civil engineer': 'General Engineering', 'aerospace engineer': 'General Engineering', 'robotics': 'Robotics Engineering', 'robotics engineering': 'Robotics Engineering',
    'government': 'Government', 'military & defense': 'Military & Defense', 'usaf': 'Military & Defense', 'air force': 'Military & Defense',
    'arts': 'Arts', 'artist': 'Arts', 'design': 'Design', 'designer': 'Design', 'experience design': 'Design', 'ui/ux': 'Design',
    'media & streaming': 'Media & Streaming', 'media': 'Media & Streaming', 'streamer': 'Media & Streaming', 'film & entertainment': 'Film & Entertainment', 'video production': 'Film & Entertainment', 'entertainment/film': 'Film & Entertainment', 'event host': 'Film & Entertainment', 'music': 'Arts',
    'construction & trades': 'Construction & Trades', 'construction': 'Construction & Trades', 'hvac': 'Construction & Trades', 'product manager': 'Product Management', 'product management': 'Product Management', 'talent management': 'Recruiting & HR', 'student': 'Student', 'college sophmore': 'Student', 'college sophomore': 'Student', 'college studying': 'Student', 'ai engineer': 'AI & Machine Learning'
};

const occupationHierarchy = {
    'Technology': ['Software Engineering', 'Information Technology', 'Data Science', 'AI & Machine Learning', 'Product Management'],
    'Healthcare': ['Healthcare Professional', 'Neuroscience Research', 'Biotech & Pharma', 'Scientific Research'],
    'Business & Finance': ['Business & Finance', 'Recruiting & HR'],
    'Law': ['Law'],
    'Education': ['Education', 'Student'],
    'Engineering': ['General Engineering', 'Mechatronics Engineering', 'Robotics Engineering'],
    'Government & Public Sector': ['Government', 'Military & Defense'],
    'Arts & Entertainment': ['Arts', 'Design', 'Media & Streaming', 'Film & Entertainment'],
    'Construction & Trades': ['Construction & Trades']
};

const occupationToCategory = {};
for (const category in occupationHierarchy) {
    for (const occ of occupationHierarchy[category]) { occupationToCategory[occ] = category; }
}

const degreeNormalizationMap = {
    'bachelor of science': 'Bachelor of Science', 'bachelor of arts': 'Bachelor of Arts', 'bachelors': "Bachelor's Degree", 'bachelor': "Bachelor's Degree", 'bba': "Bachelor's Degree", 'bs': 'Bachelor of Science', 'b.s.': 'Bachelor of Science', 'ba': 'Bachelor of Arts', 'b.a.': 'Bachelor of Arts',
    'masters': "Master's Degree", 'ms': 'Master of Science', 'm.s.': 'Master of Science', 'ma': 'Master of Arts', 'm.a.': 'Master of Arts',
    'phd': 'Doctor of Philosophy', 'ph.d.': 'Doctor of Philosophy', 'doctorate': 'Doctor of Philosophy',
    'associates': "Associate's Degree", 'aa': "Associate's Degree", 'as': "Associate's Degree"
};

const greekNormalizationMap = {
    'alpha phi alpha': 'Alpha Phi Alpha',
    'alpha phi alpha fraternity incorporated': 'Alpha Phi Alpha',
    'alpha phi alpha fraternity, inc.': 'Alpha Phi Alpha',
    'alpha phi alpha fraternity inc': 'Alpha Phi Alpha',
    'alpha kappa alpha': 'Alpha Kappa Alpha',
    'kappa alpha psi': 'Kappa Alpha Psi',
    'kappa alpha psi fraternity incorporated': 'Kappa Alpha Psi',
    'kappa alpha psi fraternity, inc.': 'Kappa Alpha Psi',
    'kappa alpha psi fraternity inc': 'Kappa Alpha Psi',
    'omega psi phi': 'Omega Psi Phi',
    'omega psi phi fraternity incorporated': 'Omega Psi Phi',
    'omega psi phi fraternity, inc.': 'Omega Psi Phi',
    'omega psi phi fraternity inc': 'Omega Psi Phi',
    'delta sigma theta': 'Delta Sigma Theta',
    'phi beta sigma': 'Phi Beta Sigma',
    'phi beta sigma fraternity incorporated': 'Phi Beta Sigma',
    'phi beta sigma fraternity, inc.': 'Phi Beta Sigma',
    'phi beta sigma fraternity inc': 'Phi Beta Sigma',
    'zeta phi beta': 'Zeta Phi Beta',
    'sigma gamma rho': 'Sigma Gamma Rho',
    'iota phi theta': 'Iota Phi Theta',
    'iota phi theta fraternity incorporated': 'Iota Phi Theta',
    'iota phi theta fraternity, inc.': 'Iota Phi Theta',
    'iota phi theta fraternity inc': 'Iota Phi Theta',
    'delta sigma phi': 'Delta Sigma Phi',
    'phi mu alpha sinfonia': 'Phi Mu Alpha Sinfonia'
};

const socialIcons = {
    instagram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>',
    linkedin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>',
    youtube: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83 1.48 1.73-1.73.47-.13 1.33.22 2.65.28-1.3.07-2.49.1-3.59.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>',
    website: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1h-2v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2 .9 2 2v3.45c.83-.3 1.5-.83 2-1.45-1.33 2.54-3.8 4.4-6.81 5.18z"/></svg>',
    social: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-8c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zm-4 0c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zm8 0c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2z"/></svg>'
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        stateAbbreviationMap, countryCodeMap, universityNormalizationMap, universityToStateMap, hbcuList,
        majorNormalizationMap, majorHierarchy, majorToCategory, occupationNormalizationMap, occupationHierarchy,
        occupationToCategory, degreeNormalizationMap, greekNormalizationMap
    };
}
