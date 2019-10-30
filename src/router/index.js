import Vue from 'vue'
import Router from 'vue-router'
import echartsEg from '@/components/echarts-eg'

Vue.use(Router)

export default new Router({
    routes: [
        {
            path: '/',
            name: 'echartsEg',
            component: echartsEg
        }
    ]
})
