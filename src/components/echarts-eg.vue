<template>
<div class="wrapper">
    <div class="tools">
        <el-button @click="startGraph" type="primary" style="margin-left: 60px;">画图</el-button>
        <el-button @click="clearGraph" type="success">清除</el-button>
        <el-input v-model="xZoom" placeholder="请输入 x 轴范围 x1:x2" style="width: 300px; margin: 0 40px;" @change="inputZoom"></el-input>
        <div v-if="curSampleRate" style="font-size: 16px;">{{ `当前采样率: ${curSampleRate}: 1` }}</div>
    </div>
    <div id="graph"></div>
</div>
</template>

<script>
import echarts from 'echarts'

let echartsIns = null
let defaultCfg = {
    animation: false,
    tooltip: {
        trigger: 'axis'
    },
    grid: {
        left: '5%',
        right: '5%'
    },
    xAxis: {
        type: 'category',
        data: []
    },
    yAxis: {
        type: 'value'
    },
    dataZoom: [
        {
            type: 'slider',
            xAxisIndex: [0]
        },
        {
            type: 'inside',
            xAxisIndex: [0]
        },
        {
            type: 'inside',
            xAxisIndex: [0]
        }
    ],
    series: [
        {
            name: 'sin',
            type: 'line',
            data: []
        }
    ]
}
let xOriginData = []
let yOriginData = []

export default {
    name: 'echarts-eg',
    mounted () {
        this.init()
    },
    data () {
        return {
            xZoom: '',
            sampleRates: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192],
            initSampleRate: 0,
            curSampleRate: 0,
            vS: 0,
            vE: 0,
            lockedStartIdx: 0,
            lockedEndIdx: 0,
            viewDispPoints: 10000
        }
    },
    methods: {
        init () {
            this.genData()
            echartsIns = echarts.init(document.querySelector('#graph'))
            window.addEventListener('resize', function () {
                echartsIns.resize()
            })
            echartsIns.on('datazoom', __debounce(this.handleDataZoom, 100))
            echartsIns.setOption(defaultCfg)

            function __debounce (fn, timeDelta) {
                let time
                return function (evt) {
                    clearTimeout(time)
                    time = setTimeout(_ => fn(evt), timeDelta)
                }
            }
        },
        genData () {
            xOriginData = []
            yOriginData = []
            for (let i = 0; i < 1000000; i++) {
                xOriginData.push(i)
                yOriginData.push(Math.sin(i / 100))
            }
        },
        inputZoom () {
            let [s, e] = this.xZoom.split(':')
            s = parseInt(s)
            e = parseInt(e)
            // 根据用户输入的原始数据位置 s，e 倒推出在当前 x 数据轴中的 curS，curE
            let curS = 0
            let curE = 0
            if (s <= this.initSampleRate * this.vS) {
                curS = Math.floor(s / this.initSampleRate)
            } else if (s > this.initSampleRate * this.vS && s <= ((this.vE - this.vS) * this.curSampleRate + this.vS * this.initSampleRate)) {
                curS = this.vS + Math.floor((s - this.vS * this.initSampleRate) / this.curSampleRate)
            } else {
                curS = this.vE + Math.floor((s - this.vS * this.initSampleRate - (this.vE - this.vS) * this.curSampleRate) / this.initSampleRate)
            }

            if (e <= this.initSampleRate * this.vS) {
                curE = Math.floor(e / this.initSampleRate)
            } else if (e > this.initSampleRate * this.vS && e <= ((this.vE - this.vS) * this.curSampleRate + this.vS * this.initSampleRate)) {
                curE = this.vS + Math.floor((e - this.vS * this.initSampleRate) / this.curSampleRate)
            } else {
                curE = this.vE + Math.floor((e - this.vS * this.initSampleRate - (this.vE - this.vS) * this.curSampleRate) / this.initSampleRate)
            }

            if (curE === curS) {
                curE += 1
            }

            this.handleDataZoom({start: curS, end: curE}, true)
        },
        handleDataZoom (event, isPos) {
            let cfg = echartsIns.getOption()
            let xData = cfg.xAxis[0].data
            let yData = cfg.series[0].data

            // 用户缩放的时候获取当前的可视区, 如果是用户定位，则非百分比数据，直接赋值即可
            let startIndex = Math.floor((event.batch ? event.batch[0].start : event.start) * (isPos ? 1 : xData.length / 100))
            let endIndex = Math.floor((event.batch ? event.batch[0].end : event.end) * (isPos ? 1 : xData.length / 100))
            if (endIndex >= xData.length) {
                endIndex = xData.length - 1
            }
            // 当采样率小于 1 ，并且当前可视区在锁定的可视区内的时候，直接返回即可
            if (this.lockedStartIdx + this.lockedEndIdx !== 0 && startIndex >= this.lockedStartIdx && endIndex <= this.lockedEndIdx) return

            // 调用采样算法实时获取当前最新的可视化区间，采样率以及数据
            let options = {
                isPos: isPos, // 是否是快速定位
                curS: startIndex, // 当前缩放后的新的起始位置
                curE: endIndex, // 当前缩放后的新的结束位置
                viewDispPoints: this.viewDispPoints, // 可视区点数
                sampleRates: this.sampleRates, // 采样值列表
                initSampleRate: this.initSampleRate, // 初始采样值，即非可视区采样率
                curSampleRate: this.curSampleRate, // 当前可视区采样率
                vS: this.vS, // 可视区的起始位置
                vE: this.vE // 可视区的结束位置
            }
            let [nx, ny, nS, nE, nSample] = this.viewDynamicSample(xOriginData, yOriginData, xData, yData, options)
            this.curSampleRate = nSample
            this.vS = nS
            this.vE = nE
            if (this.curSampleRate === 1) { // 对于直接输入定位的操作，这里不进行锁定
                this.lockedStartIdx = nS
                this.lockedEndIdx = nE
            } else {
                this.lockedStartIdx = 0
                this.lockedEndIdx = 0
            }

            this.renderGraph(nx, ny, this.vS, this.vE)
        },
        /* 可视区动态采样
        * 算法概要：主要针对当前可视区进行重新采样，使可视区保持足够的点数，同时，非可视区采用初始的采样率，保证总的点数不超过 4 * viewPoints，从而在大数据量的场景中提高了图像流畅度
        * 这里的采样率采用 1, 2, 4, 8, 16, ... 等，使可视区重新采样的时候能尽量的保留原先的点数，减少重绘压力
        */
        viewDynamicSample (originX, originY, x, y, {isPos, curS, curE, viewDispPoints, sampleRates, initSampleRate, curSampleRate, vS, vE}) {
            let [originLen, newXData, newYData, newS, newE, newSampleRate] = [originX.length, [], [], 0, 0, 0]
            let [i, originS, originE] = [0, 0, 0]

            // 判断当前操作是 放大、缩小还是平移
            // 并计算当前的缩放位置映射到原数据中的位置 originS, originE
            if (curS >= vS && curE <= vE) { // 放大操作, 0-----vS.....curS ~ curE.....vE-----originLen-1
                originS = vS * initSampleRate + (curS - vS) * curSampleRate
                originE = vS * initSampleRate + (curE - vS) * curSampleRate
            } else if (curS <= vS && curE >= vE) { // 缩小操作, 0-----curS-----vS.....vE-----curE-----originLen-1
                if (isPos) { // 快速定位情况
                    originS = curS * initSampleRate
                    originE = (vS + curE - vE) * initSampleRate + (vE - vS) * curSampleRate
                } else { // 用户缩放鼠标滚轮缩放情况，使用 curSampleRate 进行优化，使得缩小操作更加平滑, 消除非线性缩小的问题 (即缩小速度过快)
                    originS = vS * initSampleRate - (vS - curS) * curSampleRate
                    originE = vS * initSampleRate + (vE - vS + curE - vE) * curSampleRate
                }
            } else if ((curS < vS && curE < vE) || (curS > vS && curE > vE)) { // 平移操作
                if (curS < vS && curE < vS) { // 0-----curS-----curE-----vS.....vE-----originLen-1
                    originS = curS * initSampleRate
                    originE = curE * initSampleRate
                } else if (curS < vS && curE > vS) { // 0-----curS-----vS.....curE.....vE-----originLen-1
                    originS = isPos
                        ? curS * initSampleRate
                        : vS * initSampleRate - (vS - curS) * curSampleRate // 对于非快速定位，这里进行了优化，使平移更加平滑
                    originE = vS * initSampleRate + (curE - vS) * curSampleRate
                } else if (curS > vS && curS < vE) { // 0-----vS.....curS.....vE-----curE-----originLen-1
                    originS = vS * initSampleRate + (curS - vS) * curSampleRate
                    originE = isPos
                        ? (vS + curE - vE) * initSampleRate + (vE - vS) * curSampleRate
                        : vS * initSampleRate + (curE - vS) * curSampleRate // 对于非快速定位，这里进行了优化，使平移更加平滑
                } else { // 0-----vS.....vE-----curS-----curE-----originLen-1
                    originS = (vS + curS - vE) * initSampleRate + (vE - vS) * curSampleRate
                    originE = (vS + curE - vE) * initSampleRate + (vE - vS) * curSampleRate
                }
            } else {
                console.log(`无法识别当前操作: 当前缩放后区域 [${curS}, ${curE}], 当前可视区域 [${vS}, ${vE}]`)
                return
            }

            // 如果 originS 和 originE 间距过小，则手动增加间距，防止后续采样中因间距过小，而直接跳过 originS, originE 这段区间
            if ((originE - originS) < initSampleRate) {
                originS = originS > initSampleRate
                    ? originS - initSampleRate
                    : 0
                originE += initSampleRate
            }

            // 针对当前区间，计算新的采样率
            for (i = sampleRates.length - 1; i >= 0; i--) {
                if (Math.floor((originE - originS) / sampleRates[i]) >= viewDispPoints) {
                    newSampleRate = sampleRates[i]
                    break
                }
            }
            if (i === -1) newSampleRate = sampleRates[0]

            // 构造新的数据，其中新的数据由采样这三段数据构成： [0, originS), [originS, originE], (originE, originLen]
            // 其中 [originS, originE] 这段数据是采用新的采样率进行采样的，另外两段数据则是采用初始的采样率进行采样
            newS = newE = -1
            for (let [j, cnt] = [0, 0]; j < originLen;) {
                cnt++
                newXData.push(originX[j])
                newYData.push(originY[j])
                if (j >= originS && j <= originE) {
                    j += newSampleRate
                    if (newS === -1) {
                        newS = cnt - 1
                    }
                } else {
                    j += initSampleRate
                    if (j > originE && newE === -1) {
                        newE = cnt - 1
                    }
                }
            }
            if (newS === -1) newS = 0
            if (newE === -1) newE = newXData.length - 1

            return [newXData, newYData, newS, newE, newSampleRate]
        },
        renderGraph (nx, ny, startXIdx, endXIdx) {
            defaultCfg.xAxis.data = nx
            defaultCfg.series[0].data = ny
            if (typeof startXIdx !== 'undefined' && typeof endXIdx !== 'undefined') {
                defaultCfg.dataZoom.forEach(el => {
                    el.startValue = startXIdx
                    el.endValue = endXIdx
                })
            }
            echartsIns.setOption(defaultCfg)
        },
        startGraph () {
            // 获取当前采样率
            let i
            let len = xOriginData.length
            let newXData = []
            let newYData = []
            for (i = this.sampleRates.length - 1; i >= 0; i--) {
                if (Math.floor(len / this.sampleRates[i]) >= this.viewDispPoints) {
                    this.curSampleRate = this.sampleRates[i]
                    break
                }
            }
            if (i === -1) this.curSampleRate = this.sampleRates[0]
            this.initSampleRate = this.curSampleRate
            // 进行采样构造新的 x 轴和 y 轴数据
            for (i = 0; i < len; i += this.curSampleRate) {
                newXData.push(xOriginData[i])
                newYData.push(yOriginData[i])
            }
            this.vS = 0
            this.vE = newXData.length - 1
            this.renderGraph(newXData, newYData)
        },
        clearGraph () {
            location.reload()
        }
    }
}
</script>

<style scoped>
.tools {
    display: flex;
    align-items: center;
}
#graph {
    width: 100%;
    height: 600px;
}
</style>
