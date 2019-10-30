<template>
<div class="wrapper">
    <button @click="startGraph">画图</button>
    <button @click="clearGraph">clear</button>
    <div style="font-size: 18px;">{{ `当前采样率: ${curSampleRate}: 1` }}</div>
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
            startRender: false,
            startRenderTime: 0,
            sampleRates: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192],
            initSampleRate: 0,
            curSampleRate: 0,
            lockedStartIdx: 0,
            lockedEndIdx: 0,
            viewDispPoints: 10000
        }
    },
    methods: {
        init () {
            this.genData()
            echartsIns = echarts.init(document.querySelector('#graph'))
            echartsIns.on('finished', this.renderFinished)
            echartsIns.on('datazoom', this.handleDataZoom)
            echartsIns.setOption(defaultCfg)
        },
        genData () {
            let t1 = new Date()
            xOriginData = []
            yOriginData = []
            for (let i = 0; i < 1000000; i++) {
                xOriginData.push(i)
                yOriginData.push(Math.sin(i / 100))
            }
            console.log(`time for generate 1 million data: ${new Date() - t1} ms`)
        },
        handleDataZoom (event) {
            let cfg = echartsIns.getOption()
            let xData = cfg.xAxis[0].data
            let yData = cfg.series[0].data

            // 用户缩放的时候获取当前的可视区
            let startIndex = Math.floor((event.batch ? event.batch[0].start : event.start) * xData.length / 100)
            let endIndex = Math.floor((event.batch ? event.batch[0].end : event.end) * xData.length / 100)
            if (endIndex >= xData.length) {
                endIndex = xData.length - 1
            }
            // 当采样率小于 1 ，并且当前可视区在锁定的可视区内的时候，直接返回即可
            if (this.lockedStartIdx + this.lockedEndIdx !== 0 && startIndex >= this.lockedStartIdx && endIndex <= this.lockedEndIdx) return

            // 调用采样算法实时获取当前最新的可视化区间，采样率以及数据
            let [nx, ny, startXIdx, endXIdx, nSample] = this.viewDynamicSample(xOriginData, yOriginData, xData, yData, startIndex, endIndex, this.viewDispPoints, this.sampleRates, this.initSampleRate)
            this.curSampleRate = nSample
            if (this.curSampleRate === 1) {
                this.lockedStartIdx = startXIdx
                this.lockedEndIdx = endXIdx
            } else {
                this.lockedStartIdx = 0
                this.lockedEndIdx = 0
            }

            this.renderGraph(nx, ny, startXIdx, endXIdx)
        },
        // 可视区动态采样
        // 原始数据为：originX, originY; 当前数据为 x, y; 当前可视区范围：[xSIdx, xEIdx]; 可视区的点的个数：viewPoints；采样率列表：sampleLists，初始采样率：initSampleRate
        // 算法概要：主要针对当前可视区进行重新采样，使可视区保持足够的点数，同时，非可视区采用初始的采样率，保证总的点数不超过 4 * viewPoints，从而在大数据量的场景中提高了图像流畅度
        // 这里的采样率采用 1, 2, 4, 8, 16, ... 等，使可视区重新采样的时候能尽量的保留原先的点数，减少重绘压力
        viewDynamicSample (originX, originY, x, y, xSIdx, xEIdx, viewPoints, sampleLists, initSampleRate) {
            let t1 = new Date()
            let originLen = originX.length
            let [newXData, newYData, newXSIdx, newXEIdx, newSampleRate] = [[], [], xSIdx, xEIdx, initSampleRate]

            let [i, xOriginSIdx, xOriginEIdx] = [0, xSIdx, xEIdx]
            // 找到原数据中对应的可视区位置
            for (i = 0; i < originLen; i++) {
                if (originX[i] !== x[xSIdx]) continue
                xOriginSIdx = i
                break
            }
            for (i = originLen - 1; i >= 0; i--) {
                if (originX[i] !== x[xEIdx]) continue
                xOriginEIdx = i
                break
            }
            // 针对当前区间，计算新的采样率
            for (i = sampleLists.length - 1; i >= 0; i--) {
                if (Math.floor((xOriginEIdx - xOriginSIdx) / sampleLists[i]) >= viewPoints) {
                    newSampleRate = sampleLists[i]
                    break
                }
            }
            if (i === -1) newSampleRate = sampleLists[0]
            // 构造新的数据，其中新的数据由三段构成： [0, xOriginSIdx), [xOriginSIdx, xOriginEIdx], (xOriginEIdx, originLen]
            // 其中 [xOriginSIdx, xOriginEIdx] 这段数据是采用新的采样率进行采样的，另外两段数据则是采用初始的采样率进行采样
            for (let i = 0; i < originLen;) {
                newXData.push(originX[i])
                newYData.push(originY[i])
                if (i >= xOriginSIdx && i <= xOriginEIdx) {
                    i += newSampleRate
                } else {
                    i += initSampleRate
                }
            }
            // 保留原先的缩放位置
            // 这里需要保证 x 轴的数据是递增的
            for (i = 0; i < originLen; i++) {
                if (newXData[i] <= x[xSIdx] && newXData[i + 1] >= x[xSIdx]) {
                    newXSIdx = i
                }
                if (newXData[i] <= x[xEIdx] && newXData[i + 1] >= x[xEIdx]) {
                    newXEIdx = i
                }
            }
            console.log(`time for sample: ${new Date() - t1} ms`)
            return [newXData, newYData, newXSIdx, newXEIdx, newSampleRate]
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
            this.startRender = true
            this.startRenderTime = new Date()
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
            this.renderGraph(newXData, newYData)
        },
        renderFinished () {
            if (this.startRender) {
                console.log(`time for render graph: ${new Date() - this.startRenderTime} ms`)
                this.startRenderTime = 0
            }
            this.startRender = false
        },
        clearGraph () {
            echartsIns.clear()
            this.curSampleRate = 0
            this.initSampleRate = 0
        }
    }
}
</script>

<style scoped>
.wrapper {
    height: 800px;
}
#graph {
    width: 100%;
    height: 100%;
}
</style>
