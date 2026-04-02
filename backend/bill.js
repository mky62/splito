
        let items = [];
        let billTotal = 0;
        let selectedFile = null;
        let currentBillId = null;
        let splitPollInterval = null;
        let peopleCount = 1;

        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const cameraBtn = document.getElementById('cameraBtn');
        const preview = document.getElementById('preview');
        const extractBtn = document.getElementById('extractBtn');
        const loading = document.getElementById('loading');
        const errorDiv = document.getElementById('error');
        const itemsSection = document.getElementById('itemsSection');
        const itemsBody = document.getElementById('itemsBody');
        const shareSection = document.getElementById('shareSection');
        const shareLink = document.getElementById('shareLink');
        const totalPeopleEl = document.getElementById('totalPeople');

        function updatePeople(delta) {
            peopleCount = Math.max(1, Math.min(50, peopleCount + delta));
            totalPeopleEl.textContent = peopleCount;
            saveTotalPeople();
        }

        async function saveTotalPeople() {
            if (!currentBillId) return;
            try {
                await fetch('/api/bill/' + currentBillId + '/set-people', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ totalPeople: peopleCount }),
                });
            } catch (err) {
                console.error('Failed to save total people:', err);
            }
        }

        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { 
            e.preventDefault(); 
            dropZone.style.borderColor = '#6366F1'; 
            dropZone.style.background = '#EEF2FF';
        });
        dropZone.addEventListener('dragleave', () => { 
            dropZone.style.borderColor = '#CBD5E1'; 
            dropZone.style.background = '#F8FAFC';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#CBD5E1';
            dropZone.style.background = '#F8FAFC';
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => { 
            if (e.target.files[0]) handleFile(e.target.files[0]); 
        });

        cameraBtn.addEventListener('click', () => {
            fileInput.setAttribute('capture', 'environment');
            fileInput.click();
        });

        function handleFile(file) {
            if (!file.type.startsWith('image/')) return showError('Please select an image');
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = (e) => { 
                preview.src = e.target.result; 
                preview.style.display = 'block'; 
            };
            reader.readAsDataURL(file);
            extractBtn.disabled = false;
            errorDiv.style.display = 'none';
        }

        extractBtn.addEventListener('click', async () => {
            extractBtn.disabled = true;
            loading.style.display = 'block';
            errorDiv.style.display = 'none';
            
            const formData = new FormData();
            formData.append('file', selectedFile);

            try {
                const res = await fetch('/extract-bill', { method: 'POST', body: formData });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail);
                
                items = data.items.map(item => ({
                    name: item.name || 'Unknown',
                    price: parseFloat(item.price) || 0
                }));
                billTotal = parseFloat(data.total) || 0;
                
                renderItems();
                itemsSection.classList.remove('hidden');

                if (data.share_url) {
                    currentBillId = data.bill_id;
                    const fullUrl = window.location.origin + data.share_url;
                    shareLink.value = fullUrl;
                    shareSection.classList.remove('hidden');
                    startSplitPolling();
                }
            } catch (err) {
                showError(err.message);
            } finally {
                extractBtn.disabled = false;
                loading.style.display = 'none';
            }
        });

        function renderItems() {
            document.getElementById('itemCount').textContent = items.length;
            itemsBody.innerHTML = items.map((item, i) => '\n                <tr>\n                    <td><input type="text" value="' + item.name + '" onchange="updateItem(' + i + ', \'name\', this.value)"></td>\n                    <td><input type="number" value="' + item.price + '" step="0.01" onchange="updateItem(' + i + ', \'price\', this.value)"></td>\n                    <td><button class="delete-btn" onclick="deleteItem(' + i + ')">×</button></td>\n                </tr>\n            ').join('');
            updateTotal();
        }

        function addItem() {
            items.push({ name: '', price: 0 });
            renderItems();
        }

        function updateItem(i, field, value) {
            items[i][field] = field === 'price' ? parseFloat(value) || 0 : value;
            updateTotal();
        }

        function deleteItem(i) {
            items.splice(i, 1);
            renderItems();
        }

        function updateTotal() {
            const total = billTotal || items.reduce((sum, item) => sum + item.price, 0);
            document.getElementById('totalAmount').textContent = total.toFixed(2);
        }

        function showError(msg) {
            errorDiv.textContent = msg;
            errorDiv.style.display = 'block';
        }

        function copyLink() {
            shareLink.select();
            navigator.clipboard.writeText(shareLink.value);
        }

        // ─── Split polling ──────────────────────────
        function startSplitPolling() {
            if (splitPollInterval) clearInterval(splitPollInterval);
            pollSplit();
            splitPollInterval = setInterval(pollSplit, 3000);
        }

        async function pollSplit() {
            if (!currentBillId) return;
            try {
                const res = await fetch('/api/bill/' + currentBillId + '/split');
                if (!res.ok) return;
                const data = await res.json();

                const splitSection = document.getElementById('splitSection');
                const splitContent = document.getElementById('splitContent');
                splitSection.classList.remove('hidden');

                if (!data.allSubmitted) {
                    const num = data.numSubmitted || 0;
                    const exp = data.expectedUsers || 0;
                    const pct = exp > 0 ? Math.min(100, (num / exp) * 100) : 0;
                    splitContent.innerHTML = '\n                        <div class="waiting-state">\n                            <div class="waiting-icon">⏳</div>\n                            <div class="waiting-title">Waiting for everyone</div>\n                            <div class="participants" id="splitParticipants"></div>\n                            <div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>\n                            <div class="waiting-count">' + num + ' of ' + exp + ' submitted</div>\n                        </div>\n                    ';
                    loadSplitParticipants();
                } else {
                    if (splitPollInterval) clearInterval(splitPollInterval);
                    renderSplitResults(data);
                }
            } catch (err) {
                console.error('Split poll error:', err);
            }
        }

        async function loadSplitParticipants() {
            if (!currentBillId) return;
            try {
                const res = await fetch('/api/bill/' + currentBillId + '/selections');
                if (!res.ok) return;
                const data = await res.json();
                const container = document.getElementById('splitParticipants');
                if (container && data.selections) {
                    container.innerHTML = data.selections
                        .map(s => '<span class="participant-chip">' + escapeHtml(s.userName) + '</span>')
                        .join('');
                }
            } catch (err) {
                console.error('Failed to load participants:', err);
            }
        }

        function renderSplitResults(split) {
            const splitContent = document.getElementById('splitContent');
            const users = split.users || {};

            const userCards = Object.entries(users)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([uid, userData]) => {
                    const initial = userData.name.charAt(0).toUpperCase();
                    return '<div class="user-card"><div class="user-avatar">' + initial + '</div><div class="user-info"><div class="user-name">' + escapeHtml(userData.name) + '</div></div><div class="user-total">' + userData.total.toFixed(2) + '</div></div>';
                }).join('');

            splitContent.innerHTML = '<div>' + userCards + '</div><div class="grand-total"><span class="grand-total-label">Grand Total</span><span class="grand-total-value">' + (split.total?.toFixed(2) || '0.00') + '</span></div>';
        }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }