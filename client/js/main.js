document.addEventListener('DOMContentLoaded', async () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    function animateValue(obj, start, end, duration, isFloat = false) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            
            const currentVal = progress * (end - start) + start;
            if (isFloat) {
                obj.innerHTML = currentVal.toFixed(1) + "%";
            } else {
                obj.innerHTML = Math.floor(currentVal).toLocaleString();
            }
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    let chartData = [1200, 1900, 1500, 2200, 2800, 2400, 3100]; 
    let activeSessions = 0;

    try {
        const res = await fetch('/api/platform/public-stats');
        if (res.ok) {
            const stats = await res.json();
            
            document.getElementById('live-active-sessions').dataset.target = stats.activeSessions;
            activeSessions = stats.activeSessions;
            
            document.getElementById('live-keys-generated').innerText = stats.keysGenerated;
            
            document.getElementById('stat-completion-bar').dataset.target = stats.completionRate;
            document.getElementById('stat-uptime-bar').dataset.target = stats.uptime;
            document.getElementById('stat-bypass-bar').dataset.target = stats.bypassPrevention;

            if (stats.chartData) {
                chartData = stats.chartData;
            }
        }
    } catch (e) {
        console.error(e);
    }

    const reveals = document.querySelectorAll('.reveal');
    const revealOptions = { threshold: 0.15, rootMargin: "0px 0px -50px 0px" };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                
                if (entry.target.classList.contains('lp-metrics-content')) {
                    const compBar = document.getElementById('stat-completion-bar');
                    const upBar = document.getElementById('stat-uptime-bar');
                    const bpBar = document.getElementById('stat-bypass-bar');
                    
                    const compText = document.getElementById('stat-completion-text');
                    const upText = document.getElementById('stat-uptime-text');
                    const bpText = document.getElementById('stat-bypass-text');

                    compBar.style.width = compBar.dataset.target + "%";
                    upBar.style.width = upBar.dataset.target + "%";
                    bpBar.style.width = bpBar.dataset.target + "%";

                    animateValue(compText, 0, parseFloat(compBar.dataset.target || 85.4), 1500, true);
                    animateValue(upText, 0, parseFloat(upBar.dataset.target || 99.9), 1500, true);
                    animateValue(bpText, 0, parseFloat(bpBar.dataset.target || 98.2), 1500, true);
                }

                if (entry.target.classList.contains('lp-hero-visual')) {
                    const activeSessEl = document.getElementById('live-active-sessions');
                    if (activeSessEl && activeSessEl.dataset.target) {
                        animateValue(activeSessEl, 0, parseInt(activeSessEl.dataset.target), 1500);
                    }
                }

                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);

    reveals.forEach(reveal => {
        if (!reveal.classList.contains('active')) {
            revealObserver.observe(reveal);
        }
    });

    const chartOptions = {
        series: [{
            name: 'Executions',
            data: chartData
        }],
        chart: {
            type: 'area',
            height: '100%',
            width: '100%',
            parentHeightOffset: 0,
            toolbar: { show: false },
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800,
                dynamicAnimation: {
                    enabled: true,
                    speed: 350
                }
            },
            background: 'transparent',
            sparkline: { enabled: true }
        },
        colors: ['#14b8a6'],
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.0,
                stops: [0, 100]
            }
        },
        dataLabels: { enabled: false },
        stroke: {
            curve: 'smooth',
            width: 3
        },
        theme: { mode: 'dark' },
        tooltip: {
            theme: 'dark',
            x: { show: false },
            marker: { show: false },
            y: {
                title: {
                    formatter: function () {
                        return '';
                    }
                }
            }
        }
    };

    const chart = new ApexCharts(document.querySelector("#heroChart"), chartOptions);
    chart.render();

    setInterval(() => {
        const currentSeries = chart.w.config.series[0].data.slice();
        const lastVal = currentSeries[currentSeries.length - 1];
        const modifier = Math.floor(Math.random() * 200) - 50; 
        
        currentSeries.shift();
        currentSeries.push(Math.max(lastVal + modifier, 0));
        
        chart.updateSeries([{
            data: currentSeries
        }]);
        
        const valEl = document.getElementById('live-active-sessions');
        if (valEl && valEl.innerText !== '0') {
            const currentVal = parseInt(valEl.innerText.replace(/,/g, ''));
            const sessionMod = Math.floor(Math.random() * 5) - 2;
            valEl.innerText = Math.max(currentVal + sessionMod, activeSessions).toLocaleString();
        }
    }, 3500);
});